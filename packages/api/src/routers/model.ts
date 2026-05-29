import { protectedProcedure } from "../index";
import { listModels } from "../models";

export const modelRouter = {
  list: protectedProcedure.handler(() => listModels()),
};
