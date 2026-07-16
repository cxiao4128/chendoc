interface FinalizeUploadRecordOptions<TRecord, TResult> {
  assertQuota: () => Promise<void>;
  insert: () => Promise<TResult>;
  findCommitted: () => Promise<TRecord | undefined>;
  resolveCommitted: (record: TRecord) => TResult;
  cleanup: () => Promise<unknown>;
}

export async function finalizeUploadRecord<TRecord, TResult>(options: FinalizeUploadRecordOptions<TRecord, TResult>) {
  try {
    await options.assertQuota();
    return await options.insert();
  } catch (error) {
    const committed = await options.findCommitted();
    if (committed) return options.resolveCommitted(committed);
    await options.cleanup().catch(() => undefined);
    throw error;
  }
}
