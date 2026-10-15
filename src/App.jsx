import { useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { CHURCHES } from "./data/churches";
import ChurchGlobe from "./ui/ChurchGlobe";

function App() {
  const [activeChurch, setActiveChurch] = useState(0);

  return (
    <main className="map-page" id="top">
      <div className="ambient-grid" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="#top" aria-label="didymus.ai home">
          didymus<span>.</span>ai
        </a>
        <div className="header-status">
          <i /> Global church directory
        </div>
      </header>

      <section className="map-hero" aria-label="Church map">
        <ChurchGlobe
          activeIndex={activeChurch}
          onActiveChange={setActiveChurch}
        />

        <div className="hero-copy">
          <div className="eyebrow">
            <span /> Explore the map
          </div>
          <h1>
            <em>Explore</em>{" "}
            <br />
            churches{" "}
            <br />
            worldwide
          </h1>
          <p>
            didymus.ai is a beta project that listens to a church's sermons to
            decipher their beliefs and map them so you can explore churches
            around the world.
          </p>
        </div>

        <section className="location-rail" aria-label="Churches on the map">
          <div className="rail-heading">
            <span>Churches on the map</span>
            <span>{String(CHURCHES.length).padStart(2, "0")} locations</span>
          </div>
          <div className="location-list">
            {CHURCHES.map((church, index) => (
              <button
                className={`location-card ${activeChurch === index ? "is-active" : ""}`}
                key={church.id}
                onClick={() => setActiveChurch(index)}
                type="button"
              >
                <span className="location-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="location-copy">
                  <strong>{church.shortName}</strong>
                  <span>
                    {church.city} · {church.countryCode}
                  </span>
                </span>
                <span className="location-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}
          </div>
        </section>
      </section>
      <Analytics />
    </main>
  );
}

export default App;
