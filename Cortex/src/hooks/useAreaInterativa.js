import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const INTERVALO_SEGURANCA_AREA_MS = 1000;

/**
 * Hook useAreaInterativa
 * Transplante de arquitetura Niko -> Cortex:
 * Mede retângulos interativos na tela (Notch, Scoop, Flyout) e despacha via IPC
 * para o hit-testing passivo do backend Rust (set_ignore_cursor_events).
 * Escuta 'cortex://cursor-fora' para recolher o hover imediatamente quando o mouse sai.
 *
 * @param {string[] | string} seletores - Um ou mais seletores CSS dos elementos interativos
 * @param {() => void} [onCursorFora] - Callback executado quando o cursor sai de todas as áreas
 * @param {string} [janela="main"] - Rótulo da janela Tauri
 */
export function useAreaInterativa(seletores, onCursorFora, janela = "main") {
  const chaveSeletores = Array.isArray(seletores) ? seletores.join(",") : seletores;
  const onCursorForaRef = useRef(onCursorFora);
  onCursorForaRef.current = onCursorFora;

  useEffect(() => {
    let anterior = "";
    let quadro = 0;

    const medir = () => {
      quadro = 0;
      if (typeof document === "undefined") return;

      const retangulos = [...document.querySelectorAll(chaveSeletores)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
        }));

      // Pausa o envio se a lista for vazia (durante transições/ciclos de montagem)
      // para evitar que o dock se tranque sozinho por falso negativo
      if (retangulos.length === 0) return;

      const atual = JSON.stringify(retangulos);
      if (atual === anterior) return;
      anterior = atual;

      invoke("area_interativa", { janela, retangulos }).catch(() => {});
    };

    const agendar = () => {
      if (!quadro && typeof window !== "undefined") {
        quadro = window.requestAnimationFrame(medir);
      }
    };

    const atributos = new MutationObserver(agendar);
    const observarAlvos = () => {
      atributos.disconnect();
      if (typeof document === "undefined") return;

      for (const el of document.querySelectorAll(chaveSeletores)) {
        for (let no = el; no && no !== document.body; no = no.parentElement) {
          atributos.observe(no, { attributes: true, attributeFilter: ["style", "class"] });
        }
      }
    };

    const estrutura = new MutationObserver(() => {
      observarAlvos();
      agendar();
    });

    observarAlvos();
    medir();

    if (typeof document !== "undefined" && document.body) {
      estrutura.observe(document.body, { subtree: true, childList: true });
    }

    const eventos = ["resize", "transitionend", "animationend"];
    if (typeof window !== "undefined") {
      for (const e of eventos) {
        window.addEventListener(e, agendar, true);
      }
    }

    const seguranca =
      typeof window !== "undefined"
        ? window.setInterval(agendar, INTERVALO_SEGURANCA_AREA_MS)
        : null;

    return () => {
      atributos.disconnect();
      estrutura.disconnect();
      if (typeof window !== "undefined") {
        for (const e of eventos) {
          window.removeEventListener(e, agendar, true);
        }
        if (seguranca) window.clearInterval(seguranca);
        if (quadro) window.cancelAnimationFrame(quadro);
      }
    };
  }, [chaveSeletores, janela]);

  // Escuta o evento emitido pelo backend Rust ao sair de todos os retângulos
  useEffect(() => {
    let unlisten;
    let ativo = true;

    listen("cortex://cursor-fora", () => {
      if (ativo && onCursorForaRef.current) {
        onCursorForaRef.current();
      }
    })
      .then((fn) => {
        if (ativo) unlisten = fn;
        else fn();
      })
      .catch(() => {});

    return () => {
      ativo = false;
      if (unlisten) unlisten();
    };
  }, []);
}

export default useAreaInterativa;
