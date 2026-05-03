import { EditableFieldCard } from './EditableFieldCard';

const SCREENING_FIELD_CONFIG: Array<{ key: string; label: string; multiline?: boolean }> = [
  { key: 'type', label: 'Type' },
  { key: 'name', label: 'Name' },
  { key: 'hq', label: 'HQ' },
  { key: 'sponsor_name', label: 'Sponsor name' },
  { key: 'sponsor_relationship', label: 'Sponsor Relationship' },
  { key: 'screening_request_name', label: 'Screening Request Name' },
  { key: 'submitter_name', label: 'Submitter Name' },
  { key: 'submitter_sid', label: 'Submitter SID' },
  { key: 'senior_client_execs', label: 'Senior Client Exec(s)' },
  { key: 'target_sector', label: 'Target Sector' },
  { key: 'target_revenue', label: 'Target Revenue' },
  { key: 'target_ebitda', label: 'Target EBITDA' },
  { key: 'investment_criteria', label: 'Investment Criteria', multiline: true },
  { key: 'geographical_focus', label: 'Geographical Focus' },
] as const;

interface ScreeningFieldGridProps {
  fields: Record<string, string>;
  savingByField: Record<string, boolean>;
  onSaveField: (fieldKey: string, nextValue: string) => Promise<void>;
}

export function ScreeningFieldGrid({ fields, savingByField, onSaveField }: ScreeningFieldGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {SCREENING_FIELD_CONFIG.map((field) => (
        <EditableFieldCard
          key={field.key}
          fieldKey={field.key}
          label={field.label}
          value={fields[field.key] ?? ''}
          multiline={field.multiline}
          isSaving={savingByField[field.key] ?? false}
          onSave={(nextValue) => onSaveField(field.key, nextValue)}
        />
      ))}
    </div>
  );
}
