package com.conexus.config;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.geom.Point2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Random;
import java.util.function.Consumer;

/**
 * Pictures for the demo feed, drawn in code so the demo needs no image files
 * and no network. Shapes and gradients only — no text, so no fonts are
 * required on the server.
 */
final class DemoImages {

    static final int W = 1200;
    static final int H = 900;

    private DemoImages() {}

    static byte[] studioDesk()  { return render(DemoImages::paintStudioDesk); }
    static byte[] tokyoDusk()   { return render(DemoImages::paintTokyoDusk); }
    static byte[] mixingSession() { return render(DemoImages::paintMixingSession); }
    static byte[] aiWorkflow()  { return render(DemoImages::paintAiWorkflow); }

    private static byte[] render(Consumer<Graphics2D> painter) {
        BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        painter.accept(g);
        g.dispose();

        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ImageIO.write(img, "jpg", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Could not encode a demo image", e);
        }
    }

    private static void glow(Graphics2D g, float x, float y, float radius, Color color) {
        g.setPaint(new RadialGradientPaint(new Point2D.Float(x, y), radius,
                new float[] { 0f, 1f },
                new Color[] { color, new Color(color.getRed(), color.getGreen(), color.getBlue(), 0) }));
        g.fill(new Ellipse2D.Float(x - radius, y - radius, radius * 2, radius * 2));
    }

    /** A dark desk lit by one light strip, a monitor and acoustic panels. */
    private static void paintStudioDesk(Graphics2D g) {
        g.setPaint(new GradientPaint(0, 0, new Color(0x161a36), 0, H * 0.64f, new Color(0x0c0e1d)));
        g.fillRect(0, 0, W, (int) (H * 0.64));
        g.setPaint(new GradientPaint(0, H * 0.64f, new Color(0x1c1f33), 0, H, new Color(0x0d0f18)));
        g.fillRect(0, (int) (H * 0.64), W, H);

        glow(g, W / 2f, H * 0.17f, W * 0.55f, new Color(125, 140, 255, 120));
        glow(g, W / 2f, H * 0.2f, W * 0.35f, new Color(255, 79, 139, 60));

        g.setColor(new Color(0xc6ccff));
        g.fill(new RoundRectangle2D.Float(W * 0.1f, H * 0.17f, W * 0.8f, 10, 10, 10));

        for (int side = 0; side < 2; side++) {
            float x = side == 0 ? W * 0.06f : W * 0.82f;
            for (int i = 0; i < 12; i++) {
                g.setColor(i % 2 == 0 ? new Color(0x1d2140) : new Color(0x262b4f));
                g.fillRect((int) (x + i * (W * 0.12f / 12)), (int) (H * 0.26), (int) (W * 0.12f / 12) + 1, (int) (H * 0.3));
            }
        }

        float mx = W * 0.25f, my = H * 0.3f, mw = W * 0.5f, mh = H * 0.28f;
        g.setColor(new Color(0x2b3050));
        g.fillRect((int) (W / 2f - 18), (int) (my + mh), 36, (int) (H * 0.07));
        g.fill(new RoundRectangle2D.Float(W / 2f - 90, my + mh + H * 0.065f, 180, 12, 8, 8));
        g.fill(new RoundRectangle2D.Float(mx - 8, my - 8, mw + 16, mh + 16, 22, 22));
        g.setPaint(new GradientPaint(mx, my, new Color(0x2b3480), mx + mw, my + mh, new Color(0x3a1f55)));
        g.fill(new RoundRectangle2D.Float(mx, my, mw, mh, 14, 14));
        glow(g, mx + mw * 0.3f, my + mh * 0.4f, mw * 0.45f, new Color(139, 152, 255, 70));

        glow(g, W * 0.15f, H * 0.6f, 160, new Color(255, 180, 84, 90));
        g.setColor(new Color(0xffb454));
        g.fill(new Ellipse2D.Float(W * 0.12f, H * 0.56f, W * 0.07f, H * 0.08f));

        g.setColor(new Color(0x10121f));
        g.fill(new RoundRectangle2D.Float(W * 0.36f, H * 0.72f, W * 0.28f, H * 0.05f, 16, 16));
    }

    /** Sunset over a city skyline, with lit windows. */
    private static void paintTokyoDusk(Graphics2D g) {
        g.setPaint(new LinearGradientPaint(0, 0, 0, H,
                new float[] { 0f, 0.38f, 0.7f, 1f },
                new Color[] { new Color(0xffb07a), new Color(0xff6f8e), new Color(0x6a2d77), new Color(0x25123d) }));
        g.fillRect(0, 0, W, H);

        glow(g, W / 2f, H * 0.36f, W * 0.34f, new Color(255, 230, 190, 150));
        g.setPaint(new RadialGradientPaint(new Point2D.Float(W / 2f, H * 0.36f), W * 0.1f,
                new float[] { 0f, 1f }, new Color[] { new Color(0xfff1d6), new Color(0xffc07e) }));
        g.fill(new Ellipse2D.Float(W / 2f - W * 0.1f, H * 0.36f - W * 0.1f, W * 0.2f, W * 0.2f));

        g.setColor(new Color(61, 26, 82, 215));
        g.fill(skyline(new float[][] {
                { 0, .55f }, { .08f, .55f }, { .08f, .35f }, { .15f, .35f }, { .15f, .48f }, { .24f, .48f },
                { .24f, .25f }, { .28f, .25f }, { .28f, .45f }, { .40f, .45f }, { .40f, .30f }, { .46f, .30f },
                { .46f, .50f }, { .58f, .50f }, { .58f, .20f }, { .64f, .20f }, { .64f, .45f }, { .76f, .45f },
                { .76f, .32f }, { .84f, .32f }, { .84f, .50f }, { 1, .50f } }, 0.52f));

        Path2D front = skyline(new float[][] {
                { 0, .60f }, { .06f, .60f }, { .06f, .40f }, { .12f, .40f }, { .12f, .55f }, { .18f, .55f },
                { .18f, .30f }, { .22f, .30f }, { .22f, .50f }, { .30f, .50f }, { .30f, .35f }, { .36f, .35f },
                { .36f, .58f }, { .44f, .58f }, { .44f, .44f }, { .48f, .44f }, { .50f, 0 }, { .52f, .44f },
                { .56f, .44f }, { .56f, .52f }, { .62f, .52f }, { .62f, .28f }, { .68f, .28f }, { .68f, .48f },
                { .74f, .48f }, { .74f, .38f }, { .80f, .38f }, { .80f, .56f }, { .88f, .56f }, { .88f, .42f },
                { .94f, .42f }, { .94f, .60f }, { 1, .60f } }, 0.46f);
        g.setColor(new Color(0x1c0d30));
        g.fill(front);

        Random random = new Random(42);
        g.setColor(new Color(255, 214, 140, 200));
        for (int i = 0; i < 140; i++) {
            float x = random.nextFloat() * W;
            float y = H * 0.62f + random.nextFloat() * H * 0.36f;
            if (front.contains(x, y) && front.contains(x, y - 8)) g.fillRect((int) x, (int) y, 6, 8);
        }
    }

    /** Builds a skyline from (x, y) fractions of a band sitting on the bottom edge. */
    private static Path2D skyline(float[][] points, float bandHeight) {
        float top = H * (1 - bandHeight);
        Path2D p = new Path2D.Float();
        p.moveTo(0, H);
        for (float[] pt : points) p.lineTo(pt[0] * W, top + pt[1] * H * bandHeight);
        p.lineTo(W, H);
        p.closePath();
        return p;
    }

    /** A master-bus meter: bars across the frame, indigo through pink to amber. */
    private static void paintMixingSession(Graphics2D g) {
        g.setPaint(new GradientPaint(0, 0, new Color(0x0d0f1f), W, H, new Color(0x1f1030)));
        g.fillRect(0, 0, W, H);
        glow(g, W * 0.5f, H * 0.5f, W * 0.5f, new Color(139, 152, 255, 50));

        int bars = 56;
        float gap = 6, barW = (W * 0.84f - gap * (bars - 1)) / bars, x0 = W * 0.08f, mid = H / 2f;
        g.setPaint(new LinearGradientPaint(x0, 0, W - x0, 0,
                new float[] { 0f, 0.5f, 1f },
                new Color[] { new Color(0x8b98ff), new Color(0xff4f8b), new Color(0xffb454) }));
        for (int i = 0; i < bars; i++) {
            double t = i / (double) bars;
            double level = 0.18 + 0.8 * Math.abs(Math.sin(t * 9.3) * 0.6 + Math.sin(t * 23.1 + 1) * 0.3 + Math.sin(t * 3.1) * 0.25);
            float h = (float) Math.min(0.9, level) * H * 0.62f;
            g.fill(new RoundRectangle2D.Float(x0 + i * (barW + gap), mid - h / 2, barW, h, barW, barW));
        }
        g.setColor(new Color(255, 255, 255, 40));
        g.fillRect((int) x0, (int) mid - 1, (int) (W * 0.84f), 2);
    }

    /** Seven tools as nodes on a line, script to thumbnail. */
    private static void paintAiWorkflow(Graphics2D g) {
        g.setPaint(new GradientPaint(0, 0, new Color(0x1a2352), W, H, new Color(0x070915)));
        g.fillRect(0, 0, W, H);

        g.setColor(new Color(255, 255, 255, 14));
        for (int x = 0; x < W; x += 60) g.drawLine(x, 0, x, H);
        for (int y = 0; y < H; y += 60) g.drawLine(0, y, W, y);

        Color[] colors = { new Color(0x8b98ff), new Color(0x46d6c4), new Color(0xc28bff),
                           new Color(0xffb454), new Color(0xff6f8e), new Color(0x7ee2b0), new Color(0x8b98ff) };
        float[][] nodes = new float[colors.length][2];
        for (int i = 0; i < colors.length; i++) {
            nodes[i][0] = W * (0.1f + i * 0.8f / (colors.length - 1));
            nodes[i][1] = H * (0.5f + (float) Math.sin(i * 1.1) * 0.18f);
        }

        g.setStroke(new BasicStroke(5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        for (int i = 0; i < nodes.length - 1; i++) {
            float cx = (nodes[i][0] + nodes[i + 1][0]) / 2;
            Path2D link = new Path2D.Float();
            link.moveTo(nodes[i][0], nodes[i][1]);
            link.curveTo(cx, nodes[i][1], cx, nodes[i + 1][1], nodes[i + 1][0], nodes[i + 1][1]);
            g.setPaint(new GradientPaint(nodes[i][0], 0, colors[i], nodes[i + 1][0], 0, colors[i + 1]));
            g.draw(link);
        }

        for (int i = 0; i < nodes.length; i++) {
            float r = i == 0 || i == nodes.length - 1 ? 46 : 36;
            Color c = colors[i];
            glow(g, nodes[i][0], nodes[i][1], r * 3, new Color(c.getRed(), c.getGreen(), c.getBlue(), 80));
            g.setColor(new Color(0x0b1026));
            g.fill(new Ellipse2D.Float(nodes[i][0] - r, nodes[i][1] - r, r * 2, r * 2));
            g.setColor(c);
            g.setStroke(new BasicStroke(6f));
            g.draw(new Ellipse2D.Float(nodes[i][0] - r, nodes[i][1] - r, r * 2, r * 2));
            g.fill(new Ellipse2D.Float(nodes[i][0] - r * 0.35f, nodes[i][1] - r * 0.35f, r * 0.7f, r * 0.7f));
        }
    }
}
