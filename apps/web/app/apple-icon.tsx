import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ff8c74",
      }}
    >
      <svg width="112" height="112" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2v20M3.5 6.5l17 11M20.5 6.5l-17 11"
          stroke="#3e3041"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    { ...size }
  )
}
