export type VaultEntry = {
  id: string;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  group: string;
  updatedAt?: string;
  createdAt?: string;
};

export type VaultCategory = {
  id: string;
  title: string;
  description?: string;
  entries: VaultEntry[];
};

export type VaultStore = {
  version: number;
  source?: string;
  importedAt?: string;
  categories: VaultCategory[];
};
