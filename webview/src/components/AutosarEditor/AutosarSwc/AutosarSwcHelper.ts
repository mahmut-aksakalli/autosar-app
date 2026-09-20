import { useEffect, useRef, useState } from "react";
import type { AutosarEntity, SwcGraphResult, SwcGraphScope } from "../../../../../src/shared/contracts";
import { modelHost } from "../../../vscodeApi";

interface UseAutosarSwcGraphOptions {
  focusEntity?: AutosarEntity;
  workspaceRevision?: string;
  scope: SwcGraphScope;
  includeCompositionInternals: boolean;
  cacheKey?: string;
  enabled: boolean;
}

export function useAutosarSwcGraph({
  focusEntity,
  workspaceRevision,
  scope,
  includeCompositionInternals,
  cacheKey,
  enabled
}: UseAutosarSwcGraphOptions) {
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

export function findInitialNodeId(
  graph: SwcGraphResult,
  activeCompositionNodeId: string | undefined,
  preferredNodeId: string | undefined
) {
  if (activeCompositionNodeId && graph.nodes.some((node) => node.id === activeCompositionNodeId)) {
    return activeCompositionNodeId;
  }
  if (preferredNodeId && graph.nodes.some((node) => node.id === preferredNodeId)) {
    return preferredNodeId;
  }

  // Composition graphs should initially select their boundary. SWC graphs
  // should select the first inspectable SWC. The explicit fallbacks make the
  // priority order visible and also support incomplete models.
  if (graph.scope === "composition") {
    const compositionNode = graph.nodes.find((node) => node.kind === "composition");
    if (compositionNode) {
      return compositionNode.id;
    }

    const inspectableInstance = graph.nodes.find(
      (node) => node.kind === "instance" && node.inspector
    );
    if (inspectableInstance) {
      return inspectableInstance.id;
    }
  } else {
    const inspectableSwc = graph.nodes.find(
      (node) => node.kind === "swc" && node.inspector
    );
    if (inspectableSwc) {
      return inspectableSwc.id;
    }
  }

  const inspectableNode = graph.nodes.find((node) => node.inspector);
  if (inspectableNode) {
    return inspectableNode.id;
  }

  return graph.nodes[0]?.id;
}

export function createGraphCacheKey(
  workspaceRevision: string | undefined,
  scope: SwcGraphScope,
  focusId: string,
  includeCompositionInternals: boolean
) {
  const revision = workspaceRevision ?? "workspace";
  let detailLevel = "surface";
  if (includeCompositionInternals) {
    detailLevel = "internals";
  }

  return `${revision}:${scope}:${detailLevel}:${focusId}`;
}

export function findFallbackInspector(
  graphResult: SwcGraphResult | undefined,
  focusEntity: AutosarEntity | undefined
) {
  if (!graphResult) {
    return focusEntity?.inspector;
  }
  return graphResult.nodes.find((node) => node.inspector)?.inspector ?? focusEntity?.inspector;
}
