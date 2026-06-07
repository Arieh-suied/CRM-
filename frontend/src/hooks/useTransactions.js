import { useState, useEffect, useCallback } from 'react';
import { fetchTransactions, fetchSummary } from '../services/api.js';

const EMPTY_SUMMARY = { institutionBreakdown: [], monthlyTotal: 0, yearlyTotal: 0 };

export function useTransactions(filters, sort) {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params = { ...filters, ...sort, page };
        const [txRes, sumRes] = await Promise.all([
          fetchTransactions(params),
          fetchSummary(filters),
        ]);
        setTransactions(txRes.data);
        setPagination({ page: txRes.page, totalPages: txRes.totalPages, total: txRes.total });
        setSummary(sumRes);
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

  return { transactions, summary, pagination, loading, error, loadPage: load };
}
