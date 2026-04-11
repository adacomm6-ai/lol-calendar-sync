import requests
import os

VERSION = "16.1.1" # Using the version we saw earlier
HERO_LIST_URL = f"https://ddragon.leagueoflegends.com/cdn/{VERSION}/data/en_US/champion.json"
IMAGE_BASE_URL = f"https://ddragon.leagueoflegends.com/cdn/{VERSION}/img/champion/"
TARGET_DIR = "backend/hero_images"

def download_heroes():
    if not os.path.exists(TARGET_DIR):
        os.makedirs(TARGET_DIR)

    print(f"Fetching hero list from {HERO_LIST_URL}...")
    try:
        resp = requests.get(HERO_LIST_URL)
        data = resp.json()
        
        champions = data['data']
        total = len(champions)
        print(f"Found {total} champions. Downloading images...")
        
        count = 0
        for name, info in champions.items():
            image_name = info['image']['full']
            url = f"{IMAGE_BASE_URL}{image_name}"
            save_path = os.path.join(TARGET_DIR, name + ".png")
            
            if not os.path.exists(save_path):
                img_data = requests.get(url).content
                with open(save_path, 'wb') as f:
                    f.write(img_data)
                print(f"[{count+1}/{total}] Downloaded {name}")
            else:
                print(f"[{count+1}/{total}] Skipped {name} (Exists)")
            
            count += 1
            
        print("All hero images downloaded.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    download_heroes()
