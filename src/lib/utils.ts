import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function convertFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

export function compressImage(
  base64Str: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
}

export function getJobRealTimestamp(job: any, historicoTrips: any[] = []): number {
  if (job.completedAt) {
    const completedTime = new Date(job.completedAt).getTime();
    if (!isNaN(completedTime) && completedTime > 0) return completedTime;
  }
  
  if (historicoTrips && historicoTrips.length > 0) {
    const trips = historicoTrips.filter(t => t.jobId === job.id);
    if (trips.length > 0) {
      const timestamps = trips.map(t => {
        const dStr = t.dataFechamento || t.date || t.createdAt || t.uploadedAt;
        if (dStr && typeof dStr === 'object' && dStr.toDate) return dStr.toDate().getTime();
        return dStr ? new Date(dStr).getTime() : 0;
      }).filter(tz => !isNaN(tz) && tz > 0);
      if (timestamps.length > 0) {
        return Math.max(...timestamps);
      }
    }
  }

  if (job.assignedAt) {
    const assignedTime = new Date(job.assignedAt).getTime();
    if (!isNaN(assignedTime) && assignedTime > 0) return assignedTime;
  }
  if (job.startedAt) {
    const startedTime = new Date(job.startedAt).getTime();
    if (!isNaN(startedTime) && startedTime > 0) return startedTime;
  }

  if (job.createdAt) {
    const createdTime = new Date(job.createdAt).getTime();
    if (!isNaN(createdTime) && createdTime > 0) return createdTime;
  }

  return 0;
}
