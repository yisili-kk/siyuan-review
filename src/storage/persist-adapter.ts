export type PersistAdapter = {
  loadData<T>(name: string): Promise<T | undefined>;
  saveData<T>(name: string, data: T): Promise<void>;
};
