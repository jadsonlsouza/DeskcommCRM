"use client";
import Link from "next/link";

import { ArrowCircleUp } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { useSystemVersion } from "@/hooks/system/useSystemVersion";
import { cn } from "@/lib/utils";

/**
 * Controle essencial da instalação: não é removível pela interface do vínculo.
 * Mostra a versão instalada e oferece ao dono acesso ao painel de atualização.
 */
export function VersionFooter({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  /** Fecha a gaveta do mobile — é o único Link do drawer que não a recebia. */
  onNavigate?: () => void;
}) {
  const t = useT();
  const { data } = useSystemVersion();
  if (!data) return null;

  const label = data.current_version.replace(/^v/i, "");
  const personalizada = data.identity?.customized === true;
  const titulo = label
    ? `${t("Versão")} ${label}${personalizada ? ` · ${t("Personalizada")}` : ""}`
    : t("Versão ainda não confirmada");
  // Só acende quando existe versão nova de verdade. `off_release` sozinho não
  // conta: uma instalação de desenvolvimento sem versão publicada mais nova
  // ficava com o ponto pulsando pra sempre, e o texto "Nova versão · " com o
  // número vazio, apontando para uma tela que não tem o que oferecer.
  const alerta = data.is_owner && data.update_available;

  const instalada = (
    <p
      className={cn("px-3 py-1 text-[11px] text-muted-foreground", collapsed && "px-0 text-center")}
      title={titulo}
    >
      {collapsed && label ? label.split(".").slice(0, 2).join(".") : titulo}
      {data.identity && data.identity.status !== "confirmed" && (
        <span className="block text-[10px]">{t("Execução não confirmada")}</span>
      )}
    </p>
  );
  if (!data.is_owner) return instalada;

  const novo = data.latest_version?.replace(/^v/i, "") ?? "";
  const painel = t("Atualização do sistema");
  return (
    <div>
      {instalada}
      <Link
        href="/app/settings/atualizacao"
        onClick={onNavigate}
        title={alerta ? `${t("Nova versão")} ${novo} ${t("disponível")}` : painel}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-xs text-foreground hover:bg-accent/50",
          collapsed && "justify-center px-2",
        )}
      >
        {alerta && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
        )}
        {!collapsed && (
          <span className="truncate">
            {alerta ? `${t("Nova versão")}${novo ? ` · ${novo}` : ""}` : painel}
          </span>
        )}
        {collapsed && <ArrowCircleUp size={16} aria-hidden />}
      </Link>
    </div>
  );
}
