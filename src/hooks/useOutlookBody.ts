import { useCallback, useState } from 'react';
import { getBodyCoerced, setBody, type BodyCoercionType } from '../outlook/body';

export function useOutlookBody() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);

  const readBody = useCallback(async (coercionType: BodyCoercionType = 'text') => {
    setLoading(true);
    setError(null);
    try {
      const content = await getBodyCoerced(coercionType);
      setLastRead(content);
      return content;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const writeBody = useCallback(async (content: string, coercionType: BodyCoercionType = 'html') => {
    setLoading(true);
    setError(null);
    try {
      await setBody(content, coercionType);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { loading, error, lastRead, readBody, writeBody, clearError };
}
