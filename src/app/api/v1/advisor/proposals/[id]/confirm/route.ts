import { z } from "zod";
import { confirmProposal } from "@/features/advisor/server/proposals";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/advisor/proposals/:id/confirm: apply a proposed change (your explicit confirmation) */
export const POST = apiRoute<{ id: string }>(({ tx, params }) => confirmProposal(tx, z.uuid().parse(params.id)));
