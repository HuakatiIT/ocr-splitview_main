import os
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from craft_text_detector import Craft

WEIGHTS_PATH = os.environ.get("WEIGHTS_PATH", "/app/assets/craft_mlt_25k.pth")

app = FastAPI(title="CRAFT Service", version="1.0.0")

craft = Craft(
    weight_path=WEIGHTS_PATH,
    crop_type="poly",
    cuda=False
)


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        result = craft.detect_text(tmp_path)
        boxes = result.get("boxes", [])

        response_boxes = []
        for box in boxes:
            # box: numpy array of shape (4,2)
            xs = [float(p[0]) for p in box]
            ys = [float(p[1]) for p in box]
            bbox = {
                "x0": min(xs),
                "y0": min(ys),
                "x1": max(xs),
                "y1": max(ys)
            }
            response_boxes.append({
                "quad": [float(p) for point in box for p in point],
                "bbox": bbox
            })

        return JSONResponse({"boxes": response_boxes})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CRAFT detection failed: {e}")
    finally:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
