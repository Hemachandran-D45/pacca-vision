import { describe, expect, it } from "vitest";
import { PAGE_API_ROUTES, ROLES_FOR_TEST, visiblePaths } from "./page-routes.fixture.js";
import { ROUTE_POLICY } from "../../server/senderra/api.js";
import { ROLE_RANK } from "../../server/auth.js";

describe("every visible page only calls routes its role may use", () => {
  for (const role of ROLES_FOR_TEST) {
    for (const page of visiblePaths(role)) {
      it(`${role} -> ${page}`, () => {
        const routes = PAGE_API_ROUTES[page];
        expect(routes, `${page} is missing from PAGE_API_ROUTES in shared/roles.ts`).toBeDefined();
        for (const route of routes) {
          const policy = ROUTE_POLICY[route];
          expect(policy, `${route} is not in ROUTE_POLICY`).toBeDefined();
          if (policy === "public" || policy === "machine") continue;
          expect(ROLE_RANK[role] >= ROLE_RANK[policy], `${role} can open ${page} but ${route} needs ${policy}`).toBe(true);
        }
      });
    }
  }
});
