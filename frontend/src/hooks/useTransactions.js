import { useState, useEffect, useCallback } from 'react';
import { fetchTransactions } from '../services/api.js';

export function useTransactions(filters, sort) {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params = { ...filters, ...sort, page };
        const txRes = await fetchTransactions(params);
        setTransactions(txRes.data);
        setPagination({ page: txRes.page, totalPages: txRes.totalPages, total: txRes.total });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [filters, sort]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return { transactions, pagination, loading, error, loadPage: load };
}
