import { authedAdminProcedure } from "../../../../procedures/authedProcedure";
import { router } from "../../../../trpc";
import {
  ZCreateCenterSchema,
  ZDeleteCenterSchema,
  ZGetCenterSchema,
  ZListCentersSchema,
  ZUpdateCenterSchema,
} from "./schemas";

export const centerAdminRouter = router({
  list: authedAdminProcedure.input(ZListCentersSchema).query(async (opts) => {
    const { default: handler } = await import("./list.handler");

    return handler(opts);
  }),

  get: authedAdminProcedure.input(ZGetCenterSchema).query(async (opts) => {
    const { default: handler } = await import("./get.handler");

    return handler(opts);
  }),

  create: authedAdminProcedure.input(ZCreateCenterSchema).mutation(async (opts) => {
    const { default: handler } = await import("./create.handler");

    return handler(opts);
  }),

  update: authedAdminProcedure.input(ZUpdateCenterSchema).mutation(async (opts) => {
    const { default: handler } = await import("./update.handler");

    return handler(opts);
  }),

  delete: authedAdminProcedure.input(ZDeleteCenterSchema).mutation(async (opts) => {
    const { default: handler } = await import("./delete.handler");

    return handler(opts);
  }),
});
