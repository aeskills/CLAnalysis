import csv
import random
import os

def generate_mock_csv(filename, num_records):
    headers = ["Log ID", "Event Time", "Activity Type", "User Email", "IP Address"]
    
    actions = [
        "Read", "Create", "Create with public Link", 
        "Delete", "Update", "Download", "Login", "Share"
    ]
    
    domains = ["gmail.com", "yahoo.com", "outlook.com", "company.org", "adobe.com"]
    first_names = ["alex", "jordan", "taylor", "morgan", "sam", "jamie", "casey", "robin", "drew", "skyler"]
    last_names = ["smith", "jones", "miller", "davis", "garcia", "rodriguez", "wilson", "martinez", "anderson", "taylor"]

    # Pre-generate some unique emails to control duplicates
    unique_pool = []
    for _ in range(int(num_records * 0.4)):  # 40% of records will be unique emails
        fname = random.choice(first_names)
        lname = random.choice(last_names)
        domain = random.choice(domains)
        num = random.randint(1, 999)
        unique_pool.append(f"{fname}.{lname}{num}@{domain}")
    
    # Add some specific adobe.com and specific duplicates
    unique_pool.append("admin@adobe.com")
    unique_pool.append("system.alert@adobe.com")
    
    print(f"Generating {filename} with {num_records} records...")
    
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for idx in range(1, num_records + 1):
            log_id = f"LOG-{idx:06d}"
            time_str = f"2026-05-25T14:{random.randint(0,59):02d}:{random.randint(0,59):02d}Z"
            activity = random.choice(actions)
            email = random.choice(unique_pool)
            ip = f"192.168.1.{random.randint(1, 254)}"
            
            writer.writerow([log_id, time_str, activity, email, ip])

if __name__ == "__main__":
    output_dir = "./mock_data"
    generate_mock_csv(os.path.join(output_dir, "adobe_console_log_1.csv"), 15000)
    generate_mock_csv(os.path.join(output_dir, "adobe_console_log_2.csv"), 25000)
    generate_mock_csv(os.path.join(output_dir, "adobe_console_log_3_large.csv"), 150000)
    print("Mock CSV generation complete! Saved files in ./mock_data/")
