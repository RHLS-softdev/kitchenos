from dotenv import load_dotenv

load_dotenv()  # reads .env into environment before config is loaded

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
