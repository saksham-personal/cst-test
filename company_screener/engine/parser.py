"""Boolean expression parsing helpers shared by the Streamlit app and backend."""

from __future__ import annotations

from .keyword_utils import _is_exact_keyword, _keyword_has_searchable_text
from .utils import _normalize_text_value


class NumberNode:
    def __init__(self, value):
        self.value = value

    def __repr__(self):
        return f"Keyword({self.value})"


class AndNode:
    def __init__(self, left, right):
        self.left = left
        self.right = right

    def __repr__(self):
        return f"({self.left} AND {self.right})"


class OrNode:
    def __init__(self, left, right):
        self.left = left
        self.right = right

    def __repr__(self):
        return f"({self.left} OR {self.right})"


class NotNode:
    def __init__(self, child):
        self.child = child

    def __repr__(self):
        return f"(NOT {self.child})"


class ParseError(Exception):
    pass


def tokenize(expression):
    tokens = []
    i = 0
    expr = expression.strip()
    if not expr:
        return tokens
    while i < len(expr):
        if expr[i].isspace():
            i += 1
            continue
        if expr[i] == '(':
            tokens.append(('LPAREN', '('))
            i += 1
            continue
        if expr[i] == ')':
            tokens.append(('RPAREN', ')'))
            i += 1
            continue
        if expr[i].isdigit():
            j = i
            while j < len(expr) and expr[j].isdigit():
                j += 1
            tokens.append(('NUMBER', int(expr[i:j])))
            i = j
            continue
        if expr[i:].upper().startswith('AND') and (i + 3 >= len(expr) or not expr[i + 3].isalpha()):
            tokens.append(('AND', 'AND'))
            i += 3
            continue
        if expr[i:].upper().startswith('OR') and (i + 2 >= len(expr) or not expr[i + 2].isalpha()):
            tokens.append(('OR', 'OR'))
            i += 2
            continue
        if expr[i:].upper().startswith('NOT') and (i + 3 >= len(expr) or not expr[i + 3].isalpha()):
            tokens.append(('NOT', 'NOT'))
            i += 3
            continue
        raise ParseError(
            f"Unexpected character '{expr[i]}' at position {i + 1}. "
            f"Only numbers, AND, OR, NOT, and parentheses are allowed."
        )
    return tokens


class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self):
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def consume(self, expected_type=None):
        token = self.peek()
        if token is None:
            raise ParseError("Unexpected end of expression.")
        if expected_type and token[0] != expected_type:
            raise ParseError(
                f"Expected {expected_type} but got '{token[1]}' at token position {self.pos + 1}."
            )
        self.pos += 1
        return token

    def parse(self):
        if not self.tokens:
            raise ParseError("Expression is empty.")
        ast = self.parse_or_expr()
        if self.pos < len(self.tokens):
            remaining = self.tokens[self.pos]
            raise ParseError(
                f"Unexpected token '{remaining[1]}' at position {self.pos + 1}. "
                f"Possibly missing an AND/OR operator between terms."
            )
        return ast

    def parse_or_expr(self):
        left = self.parse_and_expr()
        while self.peek() and self.peek()[0] == 'OR':
            self.consume('OR')
            right = self.parse_and_expr()
            left = OrNode(left, right)
        return left

    def parse_and_expr(self):
        left = self.parse_not_expr()
        while self.peek() and self.peek()[0] == 'AND':
            self.consume('AND')
            right = self.parse_not_expr()
            left = AndNode(left, right)
        return left

    def parse_not_expr(self):
        if self.peek() and self.peek()[0] == 'NOT':
            self.consume('NOT')
            child = self.parse_not_expr()
            return NotNode(child)
        return self.parse_atom()

    def parse_atom(self):
        token = self.peek()
        if token is None:
            raise ParseError("Unexpected end of expression — expected a number or '('.")
        if token[0] == 'NUMBER':
            self.consume('NUMBER')
            return NumberNode(token[1])
        if token[0] == 'LPAREN':
            self.consume('LPAREN')
            expr = self.parse_or_expr()
            if self.peek() is None or self.peek()[0] != 'RPAREN':
                raise ParseError("Missing closing parenthesis ')'.")
            self.consume('RPAREN')
            return expr
        raise ParseError(
            f"Expected a keyword number or '(' but got '{token[1]}' at token position {self.pos + 1}."
        )


def parse_expression(expression_str):
    try:
        tokens = tokenize(expression_str)
        if not tokens:
            return None, "Expression is empty."
        parser = Parser(tokens)
        ast = parser.parse()
        return ast, None
    except ParseError as e:
        return None, str(e)


def collect_serial_numbers(node):
    if isinstance(node, NumberNode):
        return {node.value}
    if isinstance(node, NotNode):
        return collect_serial_numbers(node.child)
    if isinstance(node, (AndNode, OrNode)):
        return collect_serial_numbers(node.left) | collect_serial_numbers(node.right)
    return set()


def check_top_level_not(node):
    if isinstance(node, NotNode):
        return True
    if isinstance(node, AndNode):
        return check_top_level_not(node.left) and check_top_level_not(node.right)
    return False


def collect_positive_numbers(node):
    if isinstance(node, NumberNode):
        return {node.value}
    if isinstance(node, NotNode):
        return set()
    if isinstance(node, (AndNode, OrNode)):
        return collect_positive_numbers(node.left) | collect_positive_numbers(node.right)
    return set()


def build_keyword_serial_map(keywords_list):
    """Map serial numbers to keyword configs, defaulting to the current row order."""
    serial_map = {}
    for idx, kw in enumerate(keywords_list, start=1):
        raw_serial = kw.get('serial', idx)
        try:
            serial = int(raw_serial)
        except (TypeError, ValueError):
            continue
        if serial not in serial_map:
            serial_map[serial] = kw
    return serial_map


def validate_expression(ast, num_keywords, keywords_list):
    errors = []
    warnings = []
    serial_numbers = collect_serial_numbers(ast)
    serial_map = build_keyword_serial_map(keywords_list)
    available_serials = sorted(serial_map)
    if not serial_numbers:
        errors.append("Query must reference at least one keyword number.")
        return errors, warnings
    for sn in serial_numbers:
        if sn < 1:
            errors.append(f"Serial number {sn} is invalid. Must be >= 1.")
        else:
            kw_cfg = serial_map.get(sn)
            if kw_cfg is None:
                if available_serials == list(range(1, len(available_serials) + 1)):
                    errors.append(
                        f"Serial number {sn} does not exist. You have {len(available_serials)} keywords "
                        f"(1-{len(available_serials)})."
                    )
                else:
                    preview = ', '.join(str(v) for v in available_serials[:10])
                    suffix = " ..." if len(available_serials) > 10 else ""
                    errors.append(
                        f"Serial number {sn} does not exist. Available keyword numbers: {preview}{suffix}."
                    )
                continue

            kw_text = kw_cfg.get('keyword', '')
            if not _keyword_has_searchable_text(kw_text):
                errors.append(f"Keyword #{sn} is empty. Please enter a keyword for it.")
    if check_top_level_not(ast):
        warnings.append(
            "Your expression is entirely negative (all NOT). "
            "This will return nearly ALL companies, which could be very large."
        )
    return errors, warnings


def humanize_expression(ast, keywords_list):
    serial_map = build_keyword_serial_map(keywords_list)
    if isinstance(ast, NumberNode):
        kw_cfg = serial_map.get(ast.value)
        if kw_cfg is not None:
            kw = kw_cfg.get('keyword', f'#{ast.value}')
            if _is_exact_keyword(kw):
                return f'#{ast.value}:{kw}'
            return f'#{ast.value}:"{kw}"'
        return f'#{ast.value}'
    if isinstance(ast, NotNode):
        return f'NOT {humanize_expression(ast.child, keywords_list)}'
    if isinstance(ast, AndNode):
        left = humanize_expression(ast.left, keywords_list)
        right = humanize_expression(ast.right, keywords_list)
        return f'({left} AND {right})'
    if isinstance(ast, OrNode):
        left = humanize_expression(ast.left, keywords_list)
        right = humanize_expression(ast.right, keywords_list)
        return f'({left} OR {right})'
    return '?'


def evaluate_expression(ast, keyword_result_sets, all_company_ids):
    if isinstance(ast, NumberNode):
        return keyword_result_sets.get(ast.value, set())
    if isinstance(ast, NotNode):
        child_set = evaluate_expression(ast.child, keyword_result_sets, all_company_ids)
        return all_company_ids - child_set
    if isinstance(ast, AndNode):
        left_set = evaluate_expression(ast.left, keyword_result_sets, all_company_ids)
        right_set = evaluate_expression(ast.right, keyword_result_sets, all_company_ids)
        return left_set & right_set
    if isinstance(ast, OrNode):
        left_set = evaluate_expression(ast.left, keyword_result_sets, all_company_ids)
        right_set = evaluate_expression(ast.right, keyword_result_sets, all_company_ids)
        return left_set | right_set
    return set()

