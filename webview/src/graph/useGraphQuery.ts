import { useEffect, useRef, useState } from "react";
import type { AutosarEntity, SwcGraphResult, SwcGraphScope } from "../shared/contracts";

interface UseGraphQueryOptions {
  focusEntity?: AutosarEntity;
  workspaceRevision?: string;
  scope: SwcGraphScope;
  includeCompositionInternals: boolean;
  cacheKey?: string;
  enabled: boolean;
}

export function useGraphQuery({
  focusEntity,
  workspaceRevision,
  scope,
  includeCompositionInternals,
  cacheKey,
  enabled
}: UseGraphQueryOptions) {
  const cacheRef = useRef(new Map<string, SwcGraphResult>());
  const [cacheVersion, setCacheVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const graphResult = cacheKey ? cacheRef.current.get(cacheKey) : undefined;

  useEffect(() => {
    cacheRef.current.clear();
    setCacheVersion((version) => version + 1);
  }, [workspaceRevision]);

  useEffect(() => {
    if (!focusEntity || !enabled) {
      setLoading(false);
      setError(undefined);
      return;
    }

    if (cacheKey && cacheRef.current.has(cacheKey)) {
      setLoading(false);
      setError(undefined);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    void window.autosarApi
      .buildGraph({
        scope,
        focusId: focusEntity.semanticPath ?? focusEntity.id,
        depth: 1,
        includeCompositionInternals
      })
      .then((graph) => {
        if (cancelled) {
          return;
        }
        if (cacheKey) {
          cacheRef.current.set(cacheKey, graph);
          setCacheVersion((version) => version + 1);
        }
        setLoading(false);
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, focusEntity, includeCompositionInternals, scope, cacheVersion]);

  return { graphResult, loading, error };
}
