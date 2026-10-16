"""初始化演示数据：python manage.py seed"""
from urllib.parse import quote

from django.core.management.base import BaseCommand

from shop.models import Announcement, Prize, Product, User


def img(prompt, size="landscape_4_3"):
    return f"https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt={quote(prompt)}&image_size={size}"


PRODUCTS = [
    ("丹东红颜草莓", "时令鲜果", 3990, 5990, "盒 / 500g", 80,
     "凌晨采摘的丹东 99 红颜草莓，果肉细腻、甜度 12° 以上，全程冷链直配门店。",
     "fresh red strawberries in a rustic wooden box, close up product photography, soft daylight"),
    ("阳光玫瑰青提", "时令鲜果", 4990, 6800, "串 / 1.5kg", 60,
     "云南高原产阳光玫瑰，无籽脆甜带玫瑰香气，颗粒饱满均匀。",
     "shiny green shine muscat grapes on a ceramic plate, fresh fruit product photo, bright soft light"),
    ("赣南脐橙", "柑橘类", 2990, 3980, "箱 / 5kg", 120,
     "江西赣南脐橙，果肉化渣、酸甜适中，当日现摘当日发。",
     "fresh navel oranges in a cardboard box, orange fruit close up, warm daylight, product photography"),
    ("泰国金枕榴莲", "进口水果", 12800, 15800, "个 / 约3kg", 30,
     "泰国金枕榴莲，成熟度八成发货，果肉绵密香浓。",
     "whole durian fruit on a wooden table, tropical fruit studio product photography"),
    ("海南贵妃芒", "热带水果", 4500, 5600, "箱 / 2.5kg", 70,
     "海南树上熟贵妃芒，纤维少、汁水足，甜香浓郁。",
     "ripe mangoes in a woven basket, tropical fruit close up, bright natural light"),
    ("山东美早大樱桃", "核果类", 8800, 10800, "盒 / 1kg", 40,
     "烟台美早樱桃，果径 28mm 以上，脆甜多汁、果面亮泽。",
     "fresh red cherries in a white bowl, glossy dark red cherries close up, product photography"),
    ("新疆阿克苏苹果", "仁果类", 3900, 4900, "箱 / 5kg", 100,
     "阿克苏冰糖心苹果，昼夜温差大，果心呈半透明糖心。",
     "red apples with visible sugar core, sliced apple, rustic wooden table, product photo"),
    ("宁夏硒砂麒麟瓜", "瓜果类", 3500, 4500, "个 / 约6kg", 50,
     "宁夏压砂地麒麟西瓜，皮薄瓤脆、清甜多汁。",
     "whole watermelon and sliced watermelon on green grass, summer fruit, bright sunlight"),
]

PRIZES = [
    ("定制水果刀", 120, 50, "食品级不锈钢果刀，刀刃顺手不生锈。",
     "stainless steel fruit knife on white background, product photography"),
    ("环保帆布手提袋", 200, 80, "加厚帆布，日常买菜拎果都顺手。",
     "reusable canvas tote bag with fruit print, product photography, white background"),
    ("精品藤编果篮", 380, 40, "手工藤编果篮，居家待客有面子。",
     "handwoven rattan fruit basket, product photography, white background"),
    ("会员 9 折券", 500, 200, "下次预约取货整单享 9 折优惠。",
     "discount coupon card illustration, clean minimal design, white background"),
    ("双层不锈钢保温杯", 800, 30, "316 不锈钢内胆，保温 12 小时。",
     "double wall stainless steel thermos cup, product photography, white background"),
]

ANNOUNCEMENTS = [
    ("新店开张 · 会员礼遇",
     "欢迎来到「果子来了」！即日起注册成为会员，手机号一键登录，在线预约自提当日现摘鲜果，订单完成后按 1 元 = 1 积分累计奖励。"),
    ("积分兑换规则",
     "在平台预约订购水果，订单由门店确认并完成后自动发放积分；积分可在「积分兑换」中兑换果刀、帆布袋、果篮、保温杯等礼品，兑换后到店领取。"),
    ("每日 09:00 补货",
     "门店每日 09:00 完成补货，草莓、樱桃等时令鲜果数量有限，建议提前预约锁定库存。"),
]


class Command(BaseCommand):
    help = "初始化演示数据（商户账号、会员、商品、奖品、公告）"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="清空现有商品/奖品/公告后重建")

    def handle(self, *args, **options):
        if options["reset"]:
            Product.objects.all().delete()
            Prize.objects.all().delete()
            Announcement.objects.all().delete()
            self.stdout.write(self.style.WARNING("已清空商品 / 奖品 / 公告"))

        if not User.objects.filter(phone="13800000000").exists():
            User.objects.create_superuser(
                username="13800000000",
                phone="13800000000",
                nickname="店长",
                password="admin123",
                role=User.ROLE_ADMIN,
            )
            self.stdout.write(self.style.SUCCESS("创建商户账号 13800000000 / admin123"))

        if not User.objects.filter(phone="13900000001").exists():
            member = User.objects.create_user(
                username="13900000001",
                phone="13900000001",
                nickname="小果",
                password="123456",
                role=User.ROLE_MEMBER,
            )
            member.balance_cents = 20000
            member.points = 120
            member.save(update_fields=["balance_cents", "points"])
            self.stdout.write(self.style.SUCCESS("创建演示会员 13900000001 / 123456（余额 ¥200，积分 120）"))

        if not Product.objects.exists():
            for name, category, price, origin, unit, stock, desc, prompt in PRODUCTS:
                Product.objects.create(
                    name=name,
                    category=category,
                    price_cents=price,
                    origin_price_cents=origin,
                    unit=unit,
                    stock=stock,
                    description=desc,
                    image_url=img(prompt),
                )
            self.stdout.write(self.style.SUCCESS(f"写入 {len(PRODUCTS)} 个商品"))

        if not Prize.objects.exists():
            for name, cost, stock, desc, prompt in PRIZES:
                Prize.objects.create(
                    name=name,
                    cost_points=cost,
                    stock=stock,
                    description=desc,
                    image_url=img(prompt, "square"),
                )
            self.stdout.write(self.style.SUCCESS(f"写入 {len(PRIZES)} 个积分奖品"))

        if not Announcement.objects.exists():
            for title, content in ANNOUNCEMENTS:
                Announcement.objects.create(title=title, content=content)
            self.stdout.write(self.style.SUCCESS(f"写入 {len(ANNOUNCEMENTS)} 条公告"))

        self.stdout.write(self.style.SUCCESS("初始化完成"))
