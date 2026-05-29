import { protectedProcedure } from "../index";
import { MODELS } from "../models";

export const modelRouter = {
  list: protectedProcedure.handler(() => MODELS),
};
