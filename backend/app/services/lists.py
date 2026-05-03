from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.schemas.lists import (
    ListAddCompaniesRequest,
    ListCollectionResponse,
    ListCopyCompaniesRequest,
    ListCompanyEntry,
    ListCreateRequest,
    ListCreateResponse,
    ListDeleteResponse,
    ListDetail,
    ListMutationResponse,
    ListRemoveCompaniesRequest,
    ListRemoveCompanyResponse,
    ListSummary,
)
from app.storage.lists_repo import ListsRepository


class ListsService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repo = ListsRepository(settings.lists_dir, max_name_length=settings.list_name_max_length)

    def _to_company_entry(self, entry: dict[str, Any]) -> ListCompanyEntry:
        return ListCompanyEntry(
            company=str(entry.get("company", "")).strip(),
            added_at=str(entry.get("added_at", "")).strip(),
            source_keywords=list(entry.get("source_keywords", []) or []),
            primary_key_value=(str(entry["primary_key_value"]).strip() if entry.get("primary_key_value") else None),
            crescendo_id=(str(entry["crescendo_id"]).strip() if entry.get("crescendo_id") else None),
        )

    def _to_detail(self, data: dict[str, Any]) -> ListDetail:
        companies = [self._to_company_entry(entry) for entry in data.get("companies", [])]
        return ListDetail(
            name=str(data.get("name", "")).strip(),
            created_at=str(data.get("created_at", "")).strip(),
            updated_at=str(data.get("updated_at", "")).strip(),
            screening_id=(str(data["screening_id"]).strip() if data.get("screening_id") else None),
            screen_name=(str(data["screen_name"]).strip() if data.get("screen_name") else None),
            count=len(companies),
            companies=companies,
        )

    def list_summaries(self, screening_id: str | None = None) -> list[ListSummary]:
        return [ListSummary(**item) for item in self.repo.list_summaries(screening_id)]

    def list_lists(self, screening_id: str | None = None) -> ListCollectionResponse:
        summaries = self.list_summaries(screening_id)
        return ListCollectionResponse(count=len(summaries), lists=summaries)

    def get_list(self, name: str) -> ListDetail:
        data = self.repo.get_list(name)
        if data is None:
            raise NotFoundError(f"List '{name}' not found.")
        return self._to_detail(data)

    def create_list(self, payload: ListCreateRequest | str) -> ListCreateResponse:
        if isinstance(payload, ListCreateRequest):
            name = payload.name
            screening_id = payload.screening_id
            screen_name = payload.screen_name
        else:
            name = str(payload)
            screening_id = None
            screen_name = None
        try:
            data = self.repo.create_list(name, screening_id=screening_id, screen_name=screen_name)
        except FileExistsError as exc:
            raise ConflictError(str(exc)) from exc
        except ValueError as exc:
            raise ValidationAppError(str(exc)) from exc
        return ListCreateResponse(item=self._to_detail(data))

    def delete_list(self, name: str) -> ListDeleteResponse:
        deleted = self.repo.delete_list(name)
        return ListDeleteResponse(list_name=name, deleted=deleted)

    def add_companies(self, name: str, payload: ListAddCompaniesRequest | dict[str, Any]) -> ListMutationResponse:
        companies = payload.companies if hasattr(payload, "companies") else payload.get("companies", [])
        normalized_companies = [
            entry.model_dump() if hasattr(entry, "model_dump") else dict(entry)
            for entry in companies
        ]
        data, added, skipped = self.repo.add_companies(name, normalized_companies)
        if data is None:
            return ListMutationResponse(
                list_name=name,
                exists=False,
                count=0,
                skipped=len(normalized_companies),
            )
        detail = self._to_detail(data)
        return ListMutationResponse(
            list_name=detail.name,
            exists=True,
            count=len(detail.companies),
            added=added,
            skipped=skipped,
            removed=0,
            copied=0,
            updated_at=detail.updated_at,
            companies=detail.companies,
            detail=detail.model_dump(),
        )

    def remove_companies(self, name: str, payload: ListRemoveCompaniesRequest | dict[str, Any]) -> ListMutationResponse:
        company_names = payload.company_names if hasattr(payload, "company_names") else payload.get("company_names", [])
        data, removed = self.repo.remove_companies(name, company_names)
        if data is None:
            return ListMutationResponse(
                list_name=name,
                exists=False,
                count=0,
                removed=0,
            )
        detail = self._to_detail(data)
        return ListMutationResponse(
            list_name=detail.name,
            exists=True,
            count=len(detail.companies),
            added=0,
            skipped=0,
            removed=removed,
            copied=0,
            updated_at=detail.updated_at,
            companies=detail.companies,
            detail=detail.model_dump(),
        )

    def copy_companies(
        self,
        source_name: str,
        payload: ListCopyCompaniesRequest | dict[str, Any],
    ) -> ListMutationResponse:
        if hasattr(payload, "target_list_name"):
            target_name = payload.target_list_name
            company_names = payload.company_names
        else:
            target_name = payload.get("target_list_name", "")
            company_names = payload.get("company_names", [])

        source_detail = self.get_list(source_name)
        target_name = str(target_name).strip()
        if not target_name:
            raise ValidationAppError("Target list name cannot be empty.")
        if source_name == target_name:
            raise ValidationAppError("Source and target lists must be different.")

        target_detail = self.get_list(target_name)
        wanted = [str(name).strip() for name in company_names if str(name).strip()]
        if not wanted:
            raise ValidationAppError("At least one company name is required to copy companies.")

        # Build a lookup that accepts either the Crescendo ID (primary key) or the
        # company name, matching the way the UI identifies rows in a list.
        source_lookup: dict[str, Any] = {}
        for company in source_detail.companies:
            for alias in (company.primary_key_value, company.crescendo_id, company.company):
                if alias:
                    source_lookup.setdefault(alias.strip(), company)

        missing = sorted(name for name in set(wanted) if name not in source_lookup)
        if missing:
            raise NotFoundError(
                f"{len(missing)} company id(s) were not found in source list '{source_name}'.",
            )

        companies_to_copy = []
        seen_ids: set[str] = set()
        for identifier in wanted:
            company = source_lookup[identifier]
            dedup_key = (company.primary_key_value or company.crescendo_id or company.company or "").strip()
            if dedup_key in seen_ids:
                continue
            seen_ids.add(dedup_key)
            companies_to_copy.append(
                {
                    "company": company.company,
                    "primary_key_value": company.primary_key_value,
                    "crescendo_id": company.crescendo_id,
                    "source_keywords": company.source_keywords,
                }
            )

        data, added, skipped = self.repo.add_companies(target_detail.name, companies_to_copy)
        if data is None:
            raise NotFoundError(f"List '{target_detail.name}' not found.")

        detail = self._to_detail(data)
        copied = added
        return ListMutationResponse(
            list_name=detail.name,
            exists=True,
            count=len(detail.companies),
            added=0,
            skipped=skipped,
            removed=0,
            copied=copied,
            updated_at=detail.updated_at,
            companies=detail.companies,
            detail=detail.model_dump(),
        )

    def remove_company(self, name: str, company_name: str) -> ListRemoveCompanyResponse:
        data, removed = self.repo.remove_companies(name, [company_name])
        if data is None:
            raise NotFoundError(f"List '{name}' not found.")
        detail = self._to_detail(data)
        return ListRemoveCompanyResponse(
            list_name=detail.name,
            company_name=company_name,
            removed=bool(removed),
            count=len(detail.companies),
            updated_at=detail.updated_at,
        )
