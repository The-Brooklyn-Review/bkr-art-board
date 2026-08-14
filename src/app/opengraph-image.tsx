import { ImageResponse } from "next/og";

export const alt = "TBR Art Board";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e0e0d",
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: "50%",
            background: "#b8956b",
            marginBottom: 48,
          }}
        />
        <div
          style={{
            fontSize: 92,
            fontWeight: 600,
            color: "#ede9e2",
            letterSpacing: -1,
          }}
        >
          The Brooklyn Review
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 600,
            color: "#a39c8f",
            marginTop: 24,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          Visual Art Gallery
        </div>
      </div>
    ),
    { ...size },
  );
}
