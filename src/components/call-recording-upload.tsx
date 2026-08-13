import { useState } from "react";
import { toast } from "sonner";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useCrmMutation } from "@/hooks/use-crm";
import {
  uploadToBucket,
  RECORDING_BUCKET,
  AUDIO_MIME,
  MAX_AUDIO_BYTES,
} from "@/hooks/use-crm-extra";

/** Upload a call recording against a deal. Any rep can upload on their own deal. */
export function UploadCallRecording({ dealId }: { dealId: string }) {
  const { profile } = useAuth();
  const create = useCrmMutation("recordings", ["crm-recordings"]);
  const [busy, setBusy] = useState(false);

  const onFile = async (file?: File | null) => {
    if (!file || !profile) return;
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error("Recording is larger than the 200MB limit");
      return;
    }
    if (file.type && !AUDIO_MIME.includes(file.type)) {
      toast.error("Unsupported audio format");
      return;
    }
    setBusy(true);
    try {
      const path = await uploadToBucket(RECORDING_BUCKET, file, dealId);
      await new Promise<void>((resolve, reject) =>
        create.mutate(
          {
            type: "insert",
            values: { deal_id: dealId, uploaded_by: profile.id, audio_file_url: path },
          },
          { onSuccess: () => resolve(), onError: (e) => reject(e as Error) },
        ),
      );
      toast.success("Call recording uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button asChild variant="outline" size="sm" disabled={busy}>
      <label className="cursor-pointer">
        <Mic className="h-4 w-4" />
        {busy ? "Uploading…" : "Upload call recording"}
        <input
          type="file"
          accept={AUDIO_MIME.join(",")}
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
    </Button>
  );
}
