import { ImageResponse } from "next/og"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
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
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2v20M3.5 6.5l17 11M20.5 6.5l-17 11"
          stroke="#3e3041"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    { ...size }
  )
}
