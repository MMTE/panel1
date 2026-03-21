export interface Money {
  amount: number;
  currency: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export type SortOrder = 'asc' | 'desc';

export interface SortOptions {
  field: string;
  order: SortOrder;
}

export interface PaginationInput {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}
