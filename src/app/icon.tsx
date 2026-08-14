import { ImageResponse } from "next/og";

// A single warm-gold dot on the app's dark ground — the same "sold/selected"
// gallery-dot gesture the review workflow itself is built around. Deliberately
// this plain: anything more detailed disappears at 16–32px.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        <div
          style={{
            width: 17,
            height: 17,
            borderRadius: "50%",
            background: "#b8956b",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
