import { ImageResponse } from "next/og";

// Same mark as icon.tsx, scaled up for iOS home-screen / share-sheet
// contexts. iOS applies its own corner mask, so this stays a plain filled
// square rather than pre-rounding.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e0e0d",
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            background: "#b8956b",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
