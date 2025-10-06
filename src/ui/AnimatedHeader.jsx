import { useRef, useMemo } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import ScrambleTextPlugin from "gsap/ScrambleTextPlugin";

// Register once at module scope (not inside the component)
gsap.registerPlugin(useGSAP, ScrambleTextPlugin);

export default function AnimatedHeader() {
  const scope = useRef(null);
  const textRef = useRef(null);

  const lines = useMemo(
    () => [
      "🔎 scours the internet for churches",
      "🎧 finds their sermons",
      "🧩 listens and deciphers them",
      "✝️ helps gauge a church’s beliefs",
      "🗺️ helps you find a local church",
    ],
    []
  );

  useGSAP(
    () => {
      // Build a single timeline that loops forever
      const tl = gsap.timeline({
        repeat: -1, // loop after the last line
        repeatDelay: 0.8, // small pause before restarting
        defaults: { duration: 1.4, ease: "none" },
      });

      // Start with empty text
      gsap.set(textRef.current, { textContent: "" });

      lines.forEach((text) => {
        tl.to(textRef.current, {
          scrambleText: {
            text,
            // Use simple chars so emojis/non-latin don’t get scrambled weirdly
            chars: " .",
            // Optional polish:
            speed: 0.6, // scramble speed
            revealDelay: 0.05, // slight delay before letters “lock in”
            tweenLength: false, // keep length constant during scramble
          },
        })
          // brief hold so each line is readable
          .to({}, { duration: 1.8 });
      });
    },
    { scope, dependencies: [lines] } // GSAP context cleanup + rerun if lines change
  );

  return (
    <div className="align-middle items-left flex w-screen h-24">
      <div
        ref={scope}
        className="text-left ml-10 lg:ml-80 md:ml-40 sm:ml-20 text-3xl font-light w-full m-5"
      >
        <span className="">didymus.ai&nbsp;</span>
        <span ref={textRef} className="animated_typography" />
      </div>
    </div>
  );
}
