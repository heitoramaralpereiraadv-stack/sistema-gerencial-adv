import "server-only";
import type { ProvedorAuth } from "../servicos/usuarios";
import { supabaseAdmin } from "./supabase";

const BLOQUEIO_PERMANENTE = "876000h"; // ~100 anos

export const provedorSupabase: ProvedorAuth = {
  async convidar(email) {
    const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/definir-senha`,
    });
    if (error || !data.user) throw new Error(`Não foi possível convidar ${email}: ${error?.message}`);
    return { id: data.user.id };
  },
  async bloquear(id) {
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { ban_duration: BLOQUEIO_PERMANENTE });
    if (error) throw new Error(`Não foi possível bloquear o acesso: ${error.message}`);
  },
  async desbloquear(id) {
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { ban_duration: "none" });
    if (error) throw new Error(`Não foi possível liberar o acesso: ${error.message}`);
  },
};
