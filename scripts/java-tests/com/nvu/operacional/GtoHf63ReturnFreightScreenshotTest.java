package com.nvu.operacional;

import android.media.Image;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.ByteBuffer;
import javax.imageio.ImageIO;

public final class GtoHf63ReturnFreightScreenshotTest {
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) throws Exception {
        String[] paths = new String[] {
            "scripts/fixtures/hf63-return-freight/list-live.png",
            "scripts/fixtures/hf63-return-freight/list-menu-stabilizing.png",
            "scripts/fixtures/hf63-return-freight/list-menu-open.png"
        };
        GtoFastVisualDetector detector = new GtoFastVisualDetector();
        long timestamp = 1L;
        for (String path : paths) {
            BufferedImage image = ImageIO.read(new File(path));
            require(image != null, "HF63 screenshot must load: " + path);
            require(image.getWidth() == 1536 && image.getHeight() == 691,
                "HF63 screenshot dimensions must remain 1536x691: " + path);
            GtoFastVisualDetector.Frame frame = detector.analyze(
                new BufferedImageFrame(image, timestamp), image.getWidth(), image.getHeight(), timestamp
            );
            require(frame.hasFreightList(), "exact reported GTO freight list must be visually recognized: " + path);
            require(frame.buttons.size() == 5, "exact reported screenshot must expose five Aceitar rows: " + path + " got=" + frame.buttons.size());
            timestamp++;
        }
        System.out.println("GtoHf63ReturnFreightScreenshotTest: PASS");
    }

    private static final class BufferedImageFrame extends Image {
        private final Plane[] planes;
        private final long timestamp;
        BufferedImageFrame(BufferedImage image, long timestamp) {
            this.timestamp = timestamp;
            int width = image.getWidth();
            int height = image.getHeight();
            byte[] rgba = new byte[width * height * 4];
            int offset = 0;
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    int argb = image.getRGB(x, y);
                    rgba[offset++] = (byte) ((argb >> 16) & 0xFF);
                    rgba[offset++] = (byte) ((argb >> 8) & 0xFF);
                    rgba[offset++] = (byte) (argb & 0xFF);
                    rgba[offset++] = (byte) ((argb >> 24) & 0xFF);
                }
            }
            this.planes = new Plane[] { new BufferedPlane(ByteBuffer.wrap(rgba), width * 4) };
        }
        @Override public Plane[] getPlanes() { return planes; }
        @Override public long getTimestamp() { return timestamp; }
    }

    private static final class BufferedPlane extends Image.Plane {
        private final ByteBuffer buffer;
        private final int rowStride;
        BufferedPlane(ByteBuffer buffer, int rowStride) { this.buffer = buffer; this.rowStride = rowStride; }
        @Override public ByteBuffer getBuffer() { return buffer.duplicate(); }
        @Override public int getPixelStride() { return 4; }
        @Override public int getRowStride() { return rowStride; }
    }
}
