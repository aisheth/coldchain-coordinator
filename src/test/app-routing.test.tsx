import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it.each([
    ["/", "/"],
    ["/projects", "/projects/"],
    ["/procurement", "/procurement/"],
    ["/workers", "/workers"],
    ["/vendors", "/vendors"],
    ["/catalogue", "/catalogue"],
    ["/activity", "/activity"],
    ["/settings", "/settings"],
    ["/imports", "/imports"],
  ])("routes owner destination %s to its intended screen", (path, routeId) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes(path);

    expect(matches.at(-1)?.routeId).toBe(routeId);
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it.each([
    ["/worker", "/worker/"],
    ["/worker/history", "/worker/history"],
    ["/worker/profile", "/worker/profile"],
    ["/worker/task/a1", "/worker/task/$id"],
  ])("routes worker destination %s to its dedicated screen", (path, routeId) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).toBe(routeId);
  });
});
