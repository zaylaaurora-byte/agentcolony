'use client';

import { cn } from '@/lib/utils';

export type AnimState = 'idle' | 'walk' | 'work' | 'talk' | 'summon';

interface CharacterProps {
  agentId: string;
  color: string;
  name: string;
  animState: AnimState;
  direction?: 'left' | 'right' | 'up' | 'down';
  size?: number;
  className?: string;
}

// ─── Mastermind: Wizard with brain ────────────────────────────────────────

function MastermindSVG({ color, animState, direction = 'down', size = 48 }: { color: string; animState: AnimState; direction: string; size: number }) {
  const walkBob = animState === 'walk' ? 'animate-bounce-subtle' : '';
  const talkScale = animState === 'talk' ? 'animate-talk' : '';
  const workGlow = animState === 'work' ? 'animate-work-glow' : '';
  const flipX = direction === 'left' ? 'scale-x-[-1]' : '';

  return (
    <div className={cn('relative', walkBob, talkScale)} style={{ width: size, height: size * 1.3 }}>
      <svg viewBox="0 0 32 42" className={cn('w-full h-full', flipX, workGlow)} style={{ filter: animState === 'work' ? `drop-shadow(0 0 4px ${color})` : 'none' }}>
        {/* Body - Robe */}
        <path d="M10 20 L12 38 L20 38 L22 20 Z" fill={color} opacity="0.9" />
        <path d="M8 20 L24 20 L23 24 L9 24 Z" fill={color} />
        {/* Head */}
        <circle cx="16" cy="14" r="7" fill="#F5D6C6" />
        {/* Eyes */}
        {direction === 'down' ? (
          <>
            <circle cx="13" cy="13" r="1.2" fill="#333" />
            <circle cx="19" cy="13" r="1.2" fill="#333" />
            <circle cx="13.3" cy="12.7" r="0.4" fill="white" />
            <circle cx="19.3" cy="12.7" r="0.4" fill="white" />
          </>
        ) : direction === 'up' ? null : (
          <circle cx={direction === 'right' ? '19' : '13'} cy="13" r="1.2" fill="#333" />
        )}
        {/* Mouth */}
        {animState === 'talk' ? (
          <ellipse cx="16" cy="16.5" rx="1.5" ry="1" fill="#C4956A" />
        ) : (
          <path d="M14.5 16 Q16 17 17.5 16" stroke="#C4956A" strokeWidth="0.7" fill="none" />
        )}
        {/* Wizard Hat */}
        <path d="M6 14 L16 1 L26 14 Z" fill={color} />
        <path d="M6 14 L26 14 L24.5 17 L7.5 17 Z" fill={color} opacity="0.8" />
        {/* Brain symbol on hat */}
        <path d="M13 9 Q14 7 16 8 Q18 7 19 9 Q17 10 16 9 Q15 10 13 9Z" fill="white" opacity="0.7" />
        {/* Star particles when working */}
        {animState === 'work' && (
          <>
            <circle cx="6" cy="10" r="0.8" fill={color} opacity="0.6" />
            <circle cx="26" cy="8" r="0.6" fill={color} opacity="0.4" />
            <circle cx="8" cy="22" r="0.5" fill={color} opacity="0.5" />
          </>
        )}
        {/* Legs */}
        {animState === 'walk' ? (
          <>
            <path d="M13 38 L12 42" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M19 38 L20 42" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M13 38 L13 41" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M19 38 L19 41" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
        {/* Arms */}
        {animState === 'work' ? (
          <>
            <path d="M8 22 L4 18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M24 22 L28 18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            {/* Glowing orb */}
            <circle cx="16" cy="7" r="2" fill={color} opacity="0.4" />
          </>
        ) : animState === 'talk' ? (
          <>
            <path d="M8 22 L5 26" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M24 22 L27 20" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M8 22 L6 28" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M24 22 L26 28" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
}

// ─── Worker: Robot with hard hat ──────────────────────────────────────────

function WorkerSVG({ color, animState, direction = 'down', size = 48 }: { color: string; animState: AnimState; direction: string; size: number }) {
  const walkBob = animState === 'walk' ? 'animate-bounce-subtle' : '';
  const talkScale = animState === 'talk' ? 'animate-talk' : '';
  const workGlow = animState === 'work' ? 'animate-work-glow' : '';
  const flipX = direction === 'left' ? 'scale-x-[-1]' : '';

  return (
    <div className={cn('relative', walkBob, talkScale)} style={{ width: size, height: size * 1.3 }}>
      <svg viewBox="0 0 32 42" className={cn('w-full h-full', flipX, workGlow)} style={{ filter: animState === 'work' ? `drop-shadow(0 0 4px ${color})` : 'none' }}>
        {/* Body - Overalls */}
        <rect x="11" y="20" width="10" height="17" rx="2" fill={color} />
        <rect x="14" y="24" width="4" height="5" rx="1" fill={color} opacity="0.5" />
        {/* Shirt underneath */}
        <rect x="10" y="19" width="12" height="5" rx="1" fill="#E8E8E8" />
        {/* Head */}
        <circle cx="16" cy="13" r="6.5" fill="#F5D6C6" />
        {/* Hard hat */}
        <path d="M8 12 L24 12 L23 14 L9 14 Z" fill={color} />
        <path d="M10 12 Q16 6 22 12" fill={color} />
        {/* Eyes */}
        {direction === 'down' ? (
          <>
            <circle cx="13.5" cy="12.5" r="1.2" fill="#333" />
            <circle cx="18.5" cy="12.5" r="1.2" fill="#333" />
          </>
        ) : direction === 'up' ? null : (
          <circle cx={direction === 'right' ? '18.5' : '13.5'} cy="12.5" r="1.2" fill="#333" />
        )}
        {/* Mouth */}
        {animState === 'talk' ? (
          <ellipse cx="16" cy="16" rx="1.2" ry="0.8" fill="#C4956A" />
        ) : (
          <line x1="14.5" y1="15.5" x2="17.5" y2="15.5" stroke="#C4956A" strokeWidth="0.7" />
        )}
        {/* Wrench in hand when working */}
        {animState === 'work' && (
          <>
            <path d="M26 18 L30 14 L31 15 L27 19 Z" fill="#AAA" />
            <circle cx="30" cy="13" r="1.5" fill="none" stroke="#AAA" strokeWidth="1" />
            {/* Sparks */}
            <circle cx="30" cy="11" r="0.5" fill="#FFD700" opacity="0.8" />
            <circle cx="32" cy="13" r="0.4" fill="#FFD700" opacity="0.6" />
          </>
        )}
        {/* Legs */}
        {animState === 'walk' ? (
          <>
            <rect x="12" y="36" width="3" height="6" rx="1" fill="#556" />
            <rect x="17" y="36" width="3" height="6" rx="1" fill="#556" />
          </>
        ) : (
          <>
            <rect x="12" y="36" width="3" height="5" rx="1" fill="#556" />
            <rect x="17" y="36" width="3" height="5" rx="1" fill="#556" />
          </>
        )}
        {/* Arms */}
        {animState === 'work' ? (
          <>
            <path d="M10 21 L6 24" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M22 21 L26 18" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : animState === 'talk' ? (
          <>
            <path d="M10 21 L6 18" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M22 21 L26 19" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M10 21 L7 27" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M22 21 L25 27" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
}

// ─── Reviewer: Scientist with goggles ─────────────────────────────────────

function ReviewerSVG({ color, animState, direction = 'down', size = 48 }: { color: string; animState: AnimState; direction: string; size: number }) {
  const walkBob = animState === 'walk' ? 'animate-bounce-subtle' : '';
  const talkScale = animState === 'talk' ? 'animate-talk' : '';
  const workGlow = animState === 'work' ? 'animate-work-glow' : '';
  const flipX = direction === 'left' ? 'scale-x-[-1]' : '';

  return (
    <div className={cn('relative', walkBob, talkScale)} style={{ width: size, height: size * 1.3 }}>
      <svg viewBox="0 0 32 42" className={cn('w-full h-full', flipX, workGlow)} style={{ filter: animState === 'work' ? `drop-shadow(0 0 4px ${color})` : 'none' }}>
        {/* Body - Lab coat */}
        <path d="M9 20 L10 38 L22 38 L23 20 Z" fill="white" stroke="#DDD" strokeWidth="0.5" />
        <line x1="16" y1="20" x2="16" y2="36" stroke="#DDD" strokeWidth="0.5" />
        {/* Collar */}
        <path d="M12 19 L16 22 L20 19" fill="white" stroke="#DDD" strokeWidth="0.5" />
        {/* Head */}
        <circle cx="16" cy="13" r="7" fill="#F5D6C6" />
        {/* Hair */}
        <path d="M9 12 Q10 6 16 7 Q22 6 23 12" fill="#5A3825" />
        {/* Safety goggles */}
        <circle cx="13" cy="13" r="3" fill="none" stroke={color} strokeWidth="1.2" />
        <circle cx="19" cy="13" r="3" fill="none" stroke={color} strokeWidth="1.2" />
        <line x1="16" y1="13" x2="16" y2="13" stroke={color} strokeWidth="1.2" />
        {/* Eyes through goggles */}
        {direction === 'down' ? (
          <>
            <circle cx="13" cy="13" r="1" fill="#333" />
            <circle cx="19" cy="13" r="1" fill="#333" />
          </>
        ) : direction === 'up' ? null : (
          <circle cx={direction === 'right' ? '19' : '13'} cy="13" r="1" fill="#333" />
        )}
        {/* Mouth */}
        {animState === 'talk' ? (
          <ellipse cx="16" cy="16.5" rx="1.3" ry="0.9" fill="#C4956A" />
        ) : (
          <path d="M14.5 16 Q16 16.5 17.5 16" stroke="#C4956A" strokeWidth="0.6" fill="none" />
        )}
        {/* Clipboard when working */}
        {animState === 'work' && (
          <>
            <rect x="25" y="16" width="6" height="8" rx="0.5" fill="#8B7355" />
            <rect x="25.5" y="16.5" width="5" height="7" rx="0.3" fill="#FFF8E7" />
            <line x1="26.5" y1="18.5" x2="30" y2="18.5" stroke="#CCC" strokeWidth="0.3" />
            <line x1="26.5" y1="19.5" x2="30" y2="19.5" stroke="#CCC" strokeWidth="0.3" />
            <line x1="26.5" y1="20.5" x2="29" y2="20.5" stroke="#CCC" strokeWidth="0.3" />
            {/* Checkmark */}
            <path d="M27 21.5 L28 22.5 L30 20.5" stroke={color} strokeWidth="0.5" fill="none" />
          </>
        )}
        {/* Legs */}
        {animState === 'walk' ? (
          <>
            <path d="M13 38 L12 42" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M19 38 L20 42" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M13 38 L13 41" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M19 38 L19 41" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
        {/* Arms */}
        {animState === 'work' ? (
          <>
            <path d="M9 22 L5 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M23 22 L25 18" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : animState === 'talk' ? (
          <>
            <path d="M9 22 L6 18" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M23 22 L26 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M9 22 L6 28" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M23 22 L26 28" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
}

// ─── Creative: Artist with beret ──────────────────────────────────────────

function CreativeSVG({ color, animState, direction = 'down', size = 48 }: { color: string; animState: AnimState; direction: string; size: number }) {
  const walkBob = animState === 'walk' ? 'animate-bounce-subtle' : '';
  const talkScale = animState === 'talk' ? 'animate-talk' : '';
  const workGlow = animState === 'work' ? 'animate-work-glow' : '';
  const flipX = direction === 'left' ? 'scale-x-[-1]' : '';

  return (
    <div className={cn('relative', walkBob, talkScale)} style={{ width: size, height: size * 1.3 }}>
      <svg viewBox="0 0 32 42" className={cn('w-full h-full', flipX, workGlow)} style={{ filter: animState === 'work' ? `drop-shadow(0 0 4px ${color})` : 'none' }}>
        {/* Body - Colorful shirt */}
        <path d="M10 20 L11 38 L21 38 L22 20 Z" fill={color} opacity="0.85" />
        {/* Scarf */}
        <path d="M10 19 L22 19 L21 22 L11 22 Z" fill={color} />
        {/* Head */}
        <circle cx="16" cy="13" r="6.5" fill="#F5D6C6" />
        {/* Hair - wild creative hair */}
        <path d="M9.5 12 Q10 7 13 9 Q14 5 17 8 Q19 4 21 9 Q23 7 23 12" fill="#D4A76A" />
        {/* Beret */}
        <ellipse cx="13" cy="8" rx="6" ry="3" fill={color} transform="rotate(-10 13 8)" />
        {/* Eyes */}
        {direction === 'down' ? (
          <>
            <circle cx="13.5" cy="13" r="1.2" fill="#333" />
            <circle cx="18.5" cy="13" r="1.2" fill="#333" />
            {/* Star highlights in eyes */}
            <circle cx="13.2" cy="12.7" r="0.4" fill="white" />
            <circle cx="18.2" cy="12.7" r="0.4" fill="white" />
          </>
        ) : direction === 'up' ? null : (
          <>
            <circle cx={direction === 'right' ? '18.5' : '13.5'} cy="13" r="1.2" fill="#333" />
            <circle cx={direction === 'right' ? '18.2' : '13.2'} cy="12.7" r="0.4" fill="white" />
          </>
        )}
        {/* Mouth */}
        {animState === 'talk' ? (
          <ellipse cx="16" cy="16" rx="1.3" ry="0.8" fill="#C4956A" />
        ) : (
          <path d="M14.5 15.5 Q16 16.5 17.5 15.5" stroke="#C4956A" strokeWidth="0.7" fill="none" />
        )}
        {/* Paintbrush when working */}
        {animState === 'work' && (
          <>
            <path d="M26 14 L29 10 L30 11 L27 15 Z" fill="#8B6914" />
            <circle cx="29.5" cy="9.5" r="1.2" fill={color} />
            {/* Paint splatters */}
            <circle cx="28" cy="8" r="0.5" fill="#FF6B6B" opacity="0.7" />
            <circle cx="31" cy="11" r="0.4" fill="#4ECDC4" opacity="0.6" />
            <circle cx="27" cy="12" r="0.3" fill="#FFE66D" opacity="0.8" />
          </>
        )}
        {/* Legs */}
        {animState === 'walk' ? (
          <>
            <path d="M13 38 L12 42" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M19 38 L20 42" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M13 38 L13 41" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M19 38 L19 41" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
        {/* Arms */}
        {animState === 'work' ? (
          <>
            <path d="M10 21 L7 25" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M22 21 L26 15" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : animState === 'talk' ? (
          <>
            <path d="M10 21 L6 19" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M22 21 L25 18" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M10 21 L7 27" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M22 21 L25 27" stroke="#F5D6C6" strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
}

// ─── Main Character Component ─────────────────────────────────────────────

export function GameCharacter({ agentId, color, name, animState, direction = 'down', size = 48, className }: CharacterProps) {
  const props = { color, animState, direction, size };

  const CharacterComponent = {
    mastermind: MastermindSVG,
    worker: WorkerSVG,
    reviewer: ReviewerSVG,
    creative: CreativeSVG,
  }[agentId] || WorkerSVG;

  return (
    <div className={cn('inline-flex flex-col items-center', className)}>
      <CharacterComponent {...props} />
    </div>
  );
}

export default GameCharacter;
