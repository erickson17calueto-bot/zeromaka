export type AiClassification =
  | "income"
  | "expense"
  | "receivable"
  | "payable"
  | "transfer"
  | "loan"
  | "salary_advance"
  | "unknown";

export type AiSuggestion = {
  row_number: number;
  classification: AiClassification;
  direction?: "income" | "expense";
  category_id?: string;
  category?: string;
  contact?: string;
  account?: string;
  document_kind?: string;
  suggested_description?: string;
  confidence: number;
  reason: string;
  needs_review: boolean;
};

export type AiUsage = {
  input_tokens?: number;
  output_tokens?: number;
};
