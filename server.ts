import express from "express";
import path from "path";

const app = express();

// ✅ VERY IMPORTANT (this line fixes everything)
app.use(express.static(path.join(process.cwd(), "public")));
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.static(path.join(process.cwd(), "public")));

  // API Route for notifications
  app.post("/api/notify", async (req, res) => {
    const { email, subject, message } = req.body;

    console.log(`Notification request for ${email}: ${subject}`);

    // This is a placeholder for real email logic. 
    // In a real app, you'd use a service like SendGrid or Mailgun.
    // For now, we'll just log it and return success.
    
    /* 
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    try {
      await transporter.sendMail({
        from: '"BorrowBack" <no-reply@borrowback.app>',
        to: email,
        subject: subject,
        text: message,
      });
    } catch (error) {
      console.error("Email error:", error);
    }
    */

    res.json({ status: "ok", message: "Notification processed" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
