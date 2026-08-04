"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  /** Atraso em ms, para escalonar elementos irmãos. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
};

/**
 * Revela o conteúdo quando entra no ecrã.
 *
 * Começa visível e só se esconde depois de o JavaScript correr: assim, se os
 * scripts falharem ou o motor de busca não os executar, o conteúdo continua lá.
 * Esconder por omissão no CSS seria arriscar uma página em branco.
 */
export default function Reveal({ children, delay = 0, className = "", as = "div" }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [armado, setArmado] = useState(false);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Quem pede menos movimento não leva animação nenhuma.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Já está no ecrã no primeiro render (acima da dobra): não vale a pena
    // escondê-lo só para o revelar a seguir.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) {
      setArmado(true);
      setVisivel(true);
      return;
    }

    setArmado(true);
    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisivel(true);
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // `as` troca a tag (div, section, li) e cada uma tem o seu tipo de elemento;
  // um único ref não satisfaz os três ao mesmo tempo. Como só lemos posição e
  // observamos interseção — coisas que qualquer HTMLElement tem — a conversão é
  // segura e mantém-se contida a esta linha.
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref as React.Ref<HTMLElement>}
      className={`${armado ? "reveal" : ""} ${visivel ? "is-visible" : ""} ${className}`}
      style={armado && delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
