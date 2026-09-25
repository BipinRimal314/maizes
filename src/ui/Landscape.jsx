import { useId } from 'react'

/** A small, original landscape shared by the journey and its story interludes. */
export default function Landscape({ className = '' }) {
  const id = useId().replaceAll(':', '')
  return (
    <svg className={`landscape ${className}`} viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sky`} x2="0" y2="1">
          <stop stopColor="#182d30" /><stop offset="1" stopColor="#8b8060" />
        </linearGradient>
        <linearGradient id={`${id}-land`} x2="0" y2="1">
          <stop stopColor="#344c3c" /><stop offset="1" stopColor="#102422" />
        </linearGradient>
        <pattern id={`${id}-rows`} width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)">
          <path d="M0 0V36" stroke="#a99b62" strokeWidth="2" opacity=".13" />
        </pattern>
      </defs>
      <path fill={`url(#${id}-sky)`} d="M0 0H1000V800H0z" />
      <circle cx="730" cy="170" r="46" fill="#e9d8a3" />
      <circle cx="710" cy="157" r="47" fill="#30413e" />
      <path d="M0 370L170 235 293 330 455 180 650 360 820 240 1000 340V800H0Z" fill="#344b45" />
      <path d="M0 420Q180 285 390 405T1000 355V800H0Z" fill="#4b6048" />
      <path d="M0 490Q240 370 520 440T1000 410V800H0Z" fill={`url(#${id}-land)`} />
      <path d="M0 490Q240 370 520 440T1000 410V800H0Z" fill={`url(#${id}-rows)`} />
      {/* A dirt track widens toward the viewer and disappears behind the hill. */}
      <path d="M490 820C445 730 662 676 638 613S466 558 489 500C508 461 589 438 620 408L627 409C607 449 539 476 532 506C519 545 688 550 702 611C726 709 571 740 579 820Z" fill="#a49a70" />
      <path d="M500 820C464 741 677 675 650 612S479 555 501 503C522 466 594 440 622 410" fill="none" stroke="#c1b183" strokeWidth="3" opacity=".45" />
      <g fill="#746e50" opacity=".5">
        <ellipse cx="551" cy="764" rx="7" ry="2" /><ellipse cx="620" cy="707" rx="5" ry="1.7" />
        <ellipse cx="673" cy="627" rx="4" ry="1.4" /><ellipse cx="563" cy="550" rx="3" ry="1" />
      </g>
      <g fill="#193b30">
        {[ [80,460,1.4], [165,430,1], [875,440,1.5], [925,405,.9], [760,390,.6], [365,403,.7] ].map(([x,y,s]) => (
          <path key={x} d="M0-100L-30-35H-20L-42 0H42L20-35H30Z" transform={`translate(${x} ${y}) scale(${s})`} />
        ))}
      </g>
      <g fill="#0d2521">
        <path d="M0 620Q140 520 350 800H0Z" /><path d="M1000 560Q840 580 780 800H1000Z" />
      </g>
      {/* Upright posts, rails and a diagonal brace make a grounded farm gate. */}
      <ellipse cx="626" cy="705" rx="67" ry="7" fill="#102922" opacity=".4" />
      <g stroke="#a99464" strokeWidth="5" fill="none" strokeLinejoin="round">
        <path d="M571 705V644M679 691V630" strokeWidth="9" />
        <path d="M577 651L673 638V681L577 694ZM577 673L673 660M578 691L672 641" />
        <path d="M548 681L567 678M683 663L709 659" />
      </g>
      <g fill="#394239"><circle cx="578" cy="653" r="3" /><circle cx="578" cy="690" r="3" /><rect x="665" y="656" width="8" height="5" rx="1" /></g>
      <g fill="#dec276">
        {[[500,630],[560,570],[614,600],[655,662],[599,725],[305,555],[819,519],[217,620],[775,649]].map(([x,y]) => <circle key={x} cx={x} cy={y} r="2.5" />)}
      </g>
    </svg>
  )
}
