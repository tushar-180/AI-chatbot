export type RawMessage = {
  _id: string;
  id?: string;
  role: string;
  content: string;
  status?: string;
  createdAt: Date | string;
  branchId?: string | null;
  parentId?: string | null;
  retryOf?: string | null;
  editedFrom?: string | null;
  version?: number;
  isActive?: boolean;
  [key: string]: any;
};
