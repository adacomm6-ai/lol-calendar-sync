
from paddleocr import PaddleOCR
import json
import os

# Initialize OCR
ocr = PaddleOCR(use_angle_cls=True, lang='ch')

# Path to sample image
# Use relative path to avoid encoding issues with Chinese directory names
image_rel_path = 'public/uploads/analysis_1768021063286_1.png'
image_path = os.path.abspath(image_rel_path)

print(f"CWD: {os.getcwd()}")
print(f"Rel Path: {image_rel_path}")
print(f"Abs Path: {image_path}")
print(f"Exists: {os.path.exists(image_path)}")

try:
    # Use relative path for OCR to minimize encoding risks
    result = ocr.ocr(image_rel_path)
    
    print("Raw Result Type:", type(result))
    # print("Raw Result:", result) # Comment out if too large, but for failure case it's important

    if result is None:
        print("Result is None")
    elif len(result) == 0:
        print("Result is empty list")
    elif result[0] is None:
        print("Result[0] is None")
    
    # Clean output for readability
    clean_data = []
    
    # Handle Dictionary Return (Newer PaddleOCR/Structure)
    if result and isinstance(result[0], dict):
        res_dict = result[0]
        boxes = res_dict.get('rec_boxes', [])
        texts = res_dict.get('rec_texts', [])
        
        # Sometimes boxes are numpy arrays
        import numpy as np
        
        for i, box in enumerate(boxes):
            text = texts[i] if i < len(texts) else ""
            
            # Ensure box is a list
            if isinstance(box, np.ndarray):
                box = box.tolist()
            
            # Check structure
            # Case 1: [[x1,y1], [x2,y2]...]
            if isinstance(box[0], list) or isinstance(box[0], tuple) or isinstance(box[0], np.ndarray):
                x = box[0][0]
                y = box[0][1]
            # Case 2: [x1, y1, x2, y2...] (Flat list)
            else:
                x = box[0]
                y = box[1]

            clean_data.append({
                "text": text,
                "y": y,
                "x": x
            })
            
    # Handle List Return (Legacy/Standard OCR)
    elif result and isinstance(result[0], list):
        for line in result[0]:
            try:
                box = line[0]
                text = line[1][0]
                clean_data.append({
                    "text": text,
                    "y": box[0][1], # Top-left Y
                    "x": box[0][0]  # Top-left X
                })
            except Exception:
                 # It might be empty or malformed
                 pass
            
    # Sort by Y to see rows
    clean_data.sort(key=lambda x: x['y'])
    
    print(json.dumps(clean_data, indent=2, ensure_ascii=False))

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Error: {e}")
