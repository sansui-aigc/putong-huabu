"use client";

import { useEffect, useRef } from "react";

type FlowCurve = {
    baseY: number;
    ampY: number;
    phase: number;
    period: number;
    stroke: string;
    width: number;
    opacity: number;
};

/**
 * 无限画布动态流场背景：
 * - 高阶三次贝塞尔平滑曲线，从左右两侧涌入
 * - 中央舞台区（上下避让）保持干净，曲线只在上下流场带内流动
 * - sin 周期驱动控制点，相位错开，动效自然无缝循环
 */
export function CanvasFlowField() {
    const svgRef = useRef<SVGSVGElement>(null);
    const curvesRef = useRef<FlowCurve[]>([]);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const NS = "http://www.w3.org/2000/svg";
        const strokes = ["#403a34", "#555555", "#8a857c", "#b3ac9f"];

        const build = () => {
            const width = svg.clientWidth || 1440;
            const height = svg.clientHeight || 900;
            svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
            // 清空旧路径
            while (svg.firstChild) svg.removeChild(svg.firstChild);

            const curves: FlowCurve[] = [];
            // 上流场带：y 8%–30%；下流场带：y 70%–92%；中央 30%–70% 避让
            for (let i = 0; i < 14; i++) {
                const upper = i % 2 === 0;
                const baseY = upper
                    ? height * (0.08 + ((i % 7) / 7) * 0.22)
                    : height * (0.7 + ((i % 7) / 7) * 0.22);
                const isLead = i % 4 === 0;
                const curve: FlowCurve = {
                    baseY,
                    ampY: (isLead ? 26 : 16) + (i % 4) * 10,
                    phase: (i * 0.83) % (Math.PI * 2),
                    period: 9 + (i % 5) * 3.2,
                    stroke: isLead ? "#403a34" : strokes[i % strokes.length],
                    width: isLead ? 2 : i % 3 === 0 ? 1.4 : 1,
                    opacity: isLead ? 0.5 : 0.18 + (i % 4) * 0.05,
                };
                curves.push(curve);
                const path = document.createElementNS(NS, "path");
                path.setAttribute("fill", "none");
                path.setAttribute("stroke", curve.stroke);
                path.setAttribute("stroke-width", String(curve.width));
                path.setAttribute("stroke-opacity", String(curve.opacity));
                path.setAttribute("stroke-linecap", "round");
                svg.appendChild(path);
            }
            // 流场光点：沿主导曲线缓慢漂移的微光粒子
            for (let i = 0; i < 10; i++) {
                const dot = document.createElementNS(NS, "circle");
                dot.setAttribute("r", i % 3 === 0 ? "2.2" : "1.4");
                dot.setAttribute("fill", "#403a34");
                dot.setAttribute("opacity", i % 3 === 0 ? "0.4" : "0.22");
                dot.setAttribute("data-dot", String(i));
                svg.appendChild(dot);
            }
            curvesRef.current = curves;
        };

        const draw = (time: number) => {
            const width = svg.clientWidth || 1440;
            const height = svg.clientHeight || 900;
            const elements = Array.from(svg.children);
            const paths = elements.filter((el) => el.tagName === "path") as SVGPathElement[];
            const dots = elements.filter((el) => el.tagName === "circle") as SVGCircleElement[];
            curvesRef.current.forEach((curve, index) => {
                const path = paths[index];
                if (!path) return;
                const t = time / 1000;
                const wave = (offset: number) => Math.sin((t * 2 * Math.PI) / curve.period + curve.phase + offset);
                const x0 = -width * 0.06;
                const x1 = width * 0.16;
                const x2 = width * 0.46;
                const x3 = width * 0.72;
                const x4 = width * 1.06;
                const y0 = curve.baseY + wave(0) * curve.ampY;
                const c1y = curve.baseY + wave(1.1) * curve.ampY * 1.5;
                const c2y = curve.baseY + wave(2.3) * curve.ampY * 1.5;
                const y1 = curve.baseY + wave(3.1) * curve.ampY;
                const c3y = curve.baseY + wave(4.2) * curve.ampY * 1.4;
                const c4y = curve.baseY + wave(5.4) * curve.ampY * 1.4;
                const y2 = curve.baseY + wave(6.2) * curve.ampY;
                const d = `M ${x0} ${y0} C ${x1} ${c1y}, ${x2} ${c2y}, ${x3} ${y1} C ${x4 * 0.8} ${c3y}, ${x4} ${c4y}, ${x4 + width * 0.04} ${y2}`;
                path.setAttribute("d", d);
            });
            // 光点沿主导曲线（index 0,4,8,12）漂移
            dots.forEach((dot, index) => {
                const sourceIndex = (index % 4) * 4;
                const curve = curvesRef.current[sourceIndex];
                if (!curve) return;
                const t = time / 1000;
                const progress = ((t / (curve.period * 1.6) + index * 0.13) % 1 + 1) % 1;
                const x = -width * 0.06 + progress * (width * 1.12);
                const waveY = Math.sin((t * 2 * Math.PI) / curve.period + curve.phase + progress * 6.28) * curve.ampY;
                const y = curve.baseY + waveY;
                dot.setAttribute("cx", String(x));
                dot.setAttribute("cy", String(y));
                dot.setAttribute("opacity", index % 3 === 0 ? "0.4" : "0.22");
            });
            rafRef.current = requestAnimationFrame(draw);
        };

        build();
        rafRef.current = requestAnimationFrame(draw);
        const onResize = () => build();
        window.addEventListener("resize", onResize);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            window.removeEventListener("resize", onResize);
        };
    }, []);

    const rafRef = useRef<number | null>(null);

    return (
        <svg
            ref={svgRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
            preserveAspectRatio="none"
        />
    );
}
