import Image from 'next/image';

/** Small in-app lockup: icon + wordmark, used in the sidebar header. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image src="/logo-icon.png" alt="" width={28} height={28} className="rounded-md" priority />
      <span className="text-base font-bold tracking-tight text-white">
        tm<span className="font-light text-white/80">|</span>Pro
      </span>
    </span>
  );
}

/** Icon only — square gradient mark, no wordmark. */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return <Image src="/logo-icon.png" alt="tmPro" width={size} height={size} className={`rounded-md ${className}`} />;
}

/** Big hero lockup for the login screen. */
export function LogoHero({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <Image src="/logo-full.png" alt="tmPro" width={280} height={97} priority />
      <p className="mt-3 text-sm font-medium tracking-wide text-slate-500">your talent.unified</p>
    </div>
  );
}
