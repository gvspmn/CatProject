from locust import HttpUser, task, between

class CatBlogUser(HttpUser):
    # Користувач робить паузу від 1 до 3 секунд між кліками
    wait_time = between(1, 3)

    @task
    def load_homepage(self):
        # Заходимо на головну сторінку
        self.client.get("/")
