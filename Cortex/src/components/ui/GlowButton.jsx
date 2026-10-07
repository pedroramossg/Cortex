import React from "react";
import { cn } from "cn";

/**
 * GlowButton: Botão em formato de pílula com brilho volumétrico azul-gelo e acabamento líquido.
 * Espelha fielmente a Imagem 3 de referência:
 * - Fundo radial: #3b82f6 -> #60a5fa -> #bfdbfe
 * - Glow: shadow 0 0 24px rgba(59,130,246,0.45) e specular highlight interno
 * - Tipografia: deep navy (#08203e), font-semibold, tracking-tight
 */
export function GlowButton({
  children,
  onClick,
  className,
  type = "button",
  disabled = false,
  size = "md",
  ...props
}) {
  const sizeClasses = {
    sm: "px-3.5 py-1 text-xs gap-1",
    md: "px-5 py-2 text-sm gap-1.5",
    lg: "px-6 py-2.5 text-base gap-2",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full font-semibold select-none outline-none cursor-pointer",
        "text-[#08203e] tracking-tight",
        "bg-[radial-gradient(circle_at_50%_25%,#3b82f6_0%,#60a5fa_55%,#bfdbfe_100%)]",
        "shadow-[0_0_24px_rgba(59,130,246,0.45),inset_0_1px_1.5px_rgba(255,255,255,0.95)]",
        "hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 ease-out",
        "disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100",
        sizeClasses[size] || sizeClasses.md,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export default GlowButton;
