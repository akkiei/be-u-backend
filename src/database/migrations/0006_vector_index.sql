CREATE INDEX IF NOT EXISTS idx_scan_history_embedding_hnsw
ON scan_history
USING hnsw (embedding vector_cosine_ops);
