import { z } from "zod";
import { rejectProposal } from "@/features/advisor/server/proposals";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/advisor/proposals/:id/reject */
export const POST = apiRoute<{ id: string }>(({ tx, params }) => rejectProposal(tx, z.uuid().parse(params.id)));
