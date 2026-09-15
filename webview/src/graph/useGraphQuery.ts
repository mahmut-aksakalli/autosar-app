import { useEffect, useRef, useState } from "react";
import type { AutosarEntity, SwcGraphResult, SwcGraphScope } from "../../../src/shared/contracts";
import { modelHost } from "../vscodeApi";

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
  let graphResult: SwcGraphResult | undefined;
  if (cacheKey) {
    graphResult = cacheRef.current.get(cacheKey);
  }

  useEffect(() => {
    // A workspace revision represents a new model snapshot. Graphs from the
    // previous revision may contain entities that no longer exist.
    cacheRef.current.clear();
    setCacheVersion((version) => version + 1);
  }, [workspaceRevision]);

  useEffect(() => {
    if (!focusEntity || !enabled) {
      setLoading(false);
      setError(undefined);
      return;
    }

    if (cacheKey) {
      const cachedGraph = cacheRef.current.get(cacheKey);
      if (cachedGraph) {
        setLoading(false);
        setError(undefined);
        return;
      }
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    void modelHost
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
        let message: string;
        if (nextError instanceof Error) {
          message = nextError.message;
        } else {
          message = String(nextError);
        }
        setError(message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, focusEntity, includeCompositionInternals, scope, cacheVersion]);

  return { graphResult, loading, error };
}
