
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import json
import google.generativeai as genai
from PIL import Image
import io

app = FastAPI()

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# NOTE: API Key 从环境变量 GEMINI_API_KEY 读取，禁止在此硬编码
API_KEY = os.getenv("GEMINI_API_KEY", "")
genai.configure(api_key=API_KEY)

# Initialize Model
# Using Gemini 2.0 Flash for speed and vision capabilities
model = genai.GenerativeModel('gemini-2.0-flash-exp')

@app.post("/analyze")
async def analyze_image(image: UploadFile = File(...)):
    try:
        # Read image
        contents = await image.read()
        pil_image = Image.open(io.BytesIO(contents))

        # Define the Prompt
        prompt = """
        Analyze this League of Legends post-match scoreboard. 
        Extract the following data for both teams (Blue and Red):
        
        1. **Winner** (Blue or Red) - Look at which team has "Victory" or "Defeat".
        2. **Game Duration** (e.g. 30:00) - Usually at the top right corner.
        3. **Total Kills** - Sum of kills for both teams, or look for the total kill score at the top (e.g. 12 - 5).
        4. **Team Kills** (Blue/Red) - Specific kill counts for each team.
        
        5. **Team Names** (CRITICAL):
           - Look at the TOP HEADER of the scoreboard.
           - There is usually a central Timer/Score.
           - The Name/Abbreviation on the **LEFT** of the timer is the **BLUE TEAM**.
           - The Name/Abbreviation on the **RIGHT** of the timer is the **RED TEAM**.
           - Examples: "LNG", "IG", "BLG", "T1".
        
        6. **Detailed Player Stats** (5 Blue, 5 Red):
           - **Name**: The player's Summoner Name.
           - **Champion (Hero)**: IDENTIFY the champion from the icon next to the name. This is CRITICAL.
           - **Damage Dealt**: The number in the damage graph/column.
           - **Role**: TOP, JUNGLE, MID, ADC, SUPPORT.
           - **Team**: Blue (Left/Top) or Red (Right/Bottom).

        7. **Gold Difference Graph Location**:
           - Identify the bounding box of the "Gold Difference" (or similar economy) graph area.
           - Format: [ymin, xmin, ymax, xmax] on a scale of 0 to 1000.
           - This is CRITICAL for cropping the image.

        Important: Ensure strictly valid JSON.
        """

        # structured output schema
        response_schema = {
            "type": "object",
            "properties": {
                "winner": {"type": "string", "enum": ["Blue", "Red", "Unknown"]},
                "duration": {"type": "string"},
                "total_kills": {"type": "integer"},
                "blue_kills": {"type": "integer"},
                "red_kills": {"type": "integer"},
                "blue_team_name": {"type": "string"},
                "red_team_name": {"type": "string"},
                "gold_chart_bbox": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "[ymin, xmin, ymax, xmax] coordinates (0-1000)"
                },
                "damage_data": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "damage": {"type": "integer"},
                            "team": {"type": "string", "enum": ["Blue", "Red"]},
                            "role": {"type": "string", "enum": ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT", "Unknown"]},
                            "hero": {"type": "string"}
                        },
                        "required": ["name", "damage", "team", "role", "hero"]
                    }
                }
            },
            "required": ["winner", "duration", "damage_data"]
        }

        # Generate (Timeouts can happen, so we might want to increase timeout if possible, but default is usually fine)
        response = model.generate_content(
            [prompt, pil_image],
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=response_schema
            )
        )

        result_json = json.loads(response.text)
        data = result_json
        
        # Crop Gold Chart if BBox found
        if "gold_chart_bbox" in data and len(data["gold_chart_bbox"]) == 4:
            try:
                ymin, xmin, ymax, xmax = data["gold_chart_bbox"]
                width, height = pil_image.size
                
                # Convert 0-1000 scale to pixels
                left = (xmin / 1000) * width
                top = (ymin / 1000) * height
                right = (xmax / 1000) * width
                bottom = (ymax / 1000) * height
                
                # Validation
                if right > left and bottom > top:
                    chart_crop = pil_image.crop((left, top, right, bottom))
                    
                    # Ensure directory exists (Relative to current script in backend/)
                    # Mapping: backend/ -> ../public/uploads/gold_curves/
                    output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "uploads", "gold_curves")
                    os.makedirs(output_dir, exist_ok=True)
                    
                    filename = f"gold_curve_{os.urandom(8).hex()}.png"
                    output_path = os.path.join(output_dir, filename)
                    
                    chart_crop.save(output_path)
                    data["gold_curve_path"] = f"/uploads/gold_curves/{filename}"
            except Exception as e:
                print(f"Cropping Failed: {e}")

        # Add a meta field to indicate success source
        data["match"] = "Gemini Vision Parsed"
        data["raw_text"] = "Analyzed by Gemini 2.0 Flash"

        return {
            "success": True,
            "data": data
        }

    except Exception as e:
        print(f"Analysis Error: {e}")
        return {
            "success": False, 
            "error": str(e),
            "data": {
                # Fallback mock data structure to prevent frontend crash
                 "match": "Analysis Failed",
                 "damage_data": [],
                 "winner": "Unknown",
                 "duration": "00:00"
            }
        }

@app.post("/analyze_odds")
async def analyze_odds(image: UploadFile = File(...)):
    # Placeholder for Odds logic - could also be upgraded to Gemini 
    return {
        "success": True,
        "data": {
            "total_kills": { "threshold": 26.5, "over": 1.85, "under": 1.85 },
            "duration": { "threshold": 32.5, "over": 1.90, "under": 1.80 },
            "handicap": { "threshold": -1.5, "team_a": 1.72, "team_b": 2.05 }
        }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
