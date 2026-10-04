import { ImageResponse } from "next/og"

export const alt = "Second Brain"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        backgroundColor: "#faf5ed",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 112,
          height: 112,
          borderRadius: "50%",
          backgroundColor: "#ff8c74",
          marginBottom: 48,
        }}
      >
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2v20M3.5 6.5l17 11M20.5 6.5l-17 11"
            stroke="#3e3041"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 96,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "#3e3041",
        }}
      >
        second brain
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 36,
          color: "#5d5059",
          marginTop: 24,
        }}
      >
        A place for everything you want to remember.
      </div>
    </div>,
    { ...size }
  )
}
