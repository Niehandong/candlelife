# -*- coding: utf-8 -*-
"""阶段一的 10 幅艺术作品。

全部为公共领域作品，图片取自 Wikimedia Commons（各文件页均标注 Public domain）。
`source` 字段写明确切出处，不使用占位符——原型阶段的 source 曾是
「来源信息待正式上线前复核」，属于上线风险，此处已落实。

文章语气：先说画作本身的一个具体观察，再轻轻转向读者的夜晚与清晨。
不说教，不用感叹号。每篇 60–120 字。

阶段二后台上线后可继续扩充至 30 幅。
"""

_C = "https://commons.wikimedia.org/wiki/File:"

ART_SEED = [
    {
        "id": "van-gogh-starry-night",
        "title": "星月夜",
        "artist": "文森特·梵高",
        "year": "1889",
        "thumbnail": "art/van-gogh-starry-night-thumb.jpg",
        "image": "art/van-gogh-starry-night.jpg",
        "alt": "梵高《星月夜》，漩涡状的夜空笼罩着山下沉睡的村庄，左侧一株柏树伸向天际",
        "source": "纽约现代艺术博物馆藏，公共领域。图片来源：Wikimedia Commons "
                  + _C + "Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
        "article": "梵高在圣雷米疗养院的窗前画下这片夜空时，村庄里的灯几乎都熄了。"
                   "天上再喧腾，屋檐下也是安静的。你的这一夜也已经过去了，"
                   "醒来时天光会重新铺满窗台。",
    },
    {
        "id": "monet-water-lilies",
        "title": "睡莲",
        "artist": "克劳德·莫奈",
        "year": "1906",
        "thumbnail": "art/monet-water-lilies-thumb.jpg",
        "image": "art/monet-water-lilies.jpg",
        "alt": "莫奈《睡莲》，池面浮着成片睡莲，水中映着天光与云影",
        "source": "芝加哥艺术博物馆藏，公共领域。图片来源：Wikimedia Commons "
                  + _C + "Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg",
        "article": "莫奈在吉维尼的睡莲池畔反复观察光线与水面的变化，同一片池子画了几十年。"
                   "把这张卡留到清晨再看，也是在提醒自己：夜晚已经结束，新的光正在到来。",
    },
    {
        "id": "friedrich-moonrise-sea",
        "title": "海边的月出",
        "artist": "卡斯帕·大卫·弗里德里希",
        "year": "1822",
        "thumbnail": "art/friedrich-moonrise-sea-thumb.jpg",
        "image": "art/friedrich-moonrise-sea.jpg",
        "alt": "弗里德里希《海边的月出》，几人坐在礁石上望向海面，远处船影与初升的月亮",
        "source": "柏林旧国家美术馆藏，公共领域。图片来源：Wikimedia Commons "
                  + _C + "Caspar_David_Friedrich_-_Mondaufgang_am_Meer_-_Google_Art_Project.jpg",
        "article": "画里的人背对着我们坐着，什么也没做，只是等月亮升上来。"
                   "弗里德里希觉得这种等待本身就值得画。今晚你也停下来了，"
                   "这件事和画里的人做的是同一件。",
    },
    {
        "id": "millet-angelus",
        "title": "晚钟",
        "artist": "让-弗朗索瓦·米勒",
        "year": "1857–1859",
        "thumbnail": "art/millet-angelus-thumb.jpg",
        "image": "art/millet-angelus.jpg",
        "alt": "米勒《晚钟》，暮色田野里一对农民停下手中的活低头默立",
        "source": "巴黎奥赛博物馆藏，公共领域。图片来源：Wikimedia Commons "
                  + _C + "JEAN-FRAN%C3%87OIS_MILLET_-_El_%C3%81ngelus_"
                         "(Museo_de_Orsay,_1857-1859._%C3%93leo_sobre_lienzo,_55.5_x_66_cm).jpg",
        "article": "远处教堂的钟响了，两个人就把手里的活放下。"
                   "米勒画的不是虔诚，是一天有个明确的收尾。"
                   "你昨晚也给自己敲了这一下钟。",
    },
    {
        "id": "turner-temeraire-study",
        "title": "《无畏号》习作：汽船与灯船",
        "artist": "约瑟夫·马洛德·威廉·透纳",
        "year": "约 1838–1839",
        "thumbnail": "art/turner-fighting-temeraire-thumb.jpg",
        "image": "art/turner-fighting-temeraire.jpg",
        "alt": "透纳为《被拖去解体的无畏号》所作的习作，水面上汽船与灯船的轮廓浸在暮光里",
        "source": "伦敦国家美术馆藏（编号 N05478），为名作《被拖去解体的无畏号》之习作，"
                  "非成品原作。公共领域。图片来源：Wikimedia Commons "
                  + _C + "Joseph_Mallord_William_Turner_(1775-1851)_-_Steamer_and_Lightship,"
                         "_a_study_for_%27The_Fighting_Temeraire%27_-_N05478_-_National_Gallery.jpg",
        "article": "这是透纳为那幅著名落日画所作的草稿，笔触还很松。"
                   "他先要弄清楚光在水上怎么散开，才敢画那艘船的最后一程。"
                   "一天的收尾也可以先是草稿。",
    },
    {
        "id": "monet-impression-sunrise",
        "title": "日出·印象",
        "artist": "克劳德·莫奈",
        "year": "1872",
        "thumbnail": "art/monet-impression-sunrise-thumb.jpg",
        "image": "art/monet-impression-sunrise.jpg",
        "alt": "莫奈《日出·印象》，晨雾中的勒阿弗尔港，橙色朝阳低悬水面，小舟剪影",
        "source": "巴黎马摩丹莫奈美术馆藏，公共领域。图片来源：Wikimedia Commons "
                  + _C + "Claude_Monet,_Impression,_soleil_levant,_1872.jpg",
        "article": "「印象派」这个名字，最初是批评者从这幅画的标题里挑出来讥讽用的。"
                   "莫奈画的只是勒阿弗尔港一个普通清晨。"
                   "普通的清晨，正是你按时睡下换来的那种。",
    },
    {
        "id": "van-gogh-cafe-terrace-night",
        "title": "夜间露天咖啡座",
        "artist": "文森特·梵高",
        "year": "1888",
        "thumbnail": "art/van-gogh-cafe-terrace-night-thumb.jpg",
        "image": "art/van-gogh-cafe-terrace-night.jpg",
        "alt": "梵高《夜间露天咖啡座》，阿尔勒广场旁灯火通明的咖啡座，蓝色星空下的石板路",
        "source": "荷兰克勒勒-米勒博物馆藏，公共领域。图片来源：Wikimedia Commons "
                  + _C + "Terrace_of_a_Caf%C3%A9_at_Night_(Place_du_Forum)_(JH_1580)_-_My_Dream.jpg",
        "article": "梵高说他想画一幅没有黑色的夜。于是这里的夜是蓝的，灯是黄的，"
                   "石板路上还留着白天的暖意。夜不必是空的，"
                   "它可以只是白天慢慢凉下来的样子。",
    },
    {
        "id": "hiroshige-moon-pine",
        "title": "名所江户百景·上野山内月之松",
        "artist": "歌川广重",
        "year": "1857",
        "thumbnail": "art/hiroshige-moon-pine-thumb.jpg",
        "image": "art/hiroshige-moon-pine.jpg",
        "alt": "歌川广重《月之松》，一株松枝弯成圆环，透过圆环望见远处的池水与屋舍",
        "source": "《名所江户百景》第八十九景，公共领域。图片来源：Wikimedia Commons "
                  + _C + "100_views_edo_089.jpg",
        "article": "上野这株松的枝条被修成一个圆环，游人特意绕过来，"
                   "从环里看一眼远处的池水。广重画的是一个专门为「停下来看看」"
                   "而存在的地方。睡前这一小段，也是这样一个环。",
    },
    {
        "id": "aivazovsky-moonlit-night",
        "title": "月夜（彩色石印版）",
        "artist": "伊凡·艾瓦佐夫斯基（原作）",
        "year": "1891",
        "thumbnail": "art/aivazovsky-moonlit-seascape-thumb.jpg",
        "image": "art/aivazovsky-moonlit-seascape.jpg",
        "alt": "艾瓦佐夫斯基《月夜》，月光在海面铺出一条亮带，云层低垂，远处帆影",
        "source": "1891 年彩色石印版（chromolithography），非原作油画。公共领域。"
                  "图片来源：Wikimedia Commons "
                  + _C + "1891_Ivan_Aivazovsky_Moonlit_Night_Chromolithography.jpg",
        "article": "艾瓦佐夫斯基画了一辈子海，最爱画月光落在水面上的那条路。"
                   "那条路其实哪儿也不通，只是让人看着安心。"
                   "有些东西的用处就是让人安心，比如按时熄灯。",
    },
    {
        "id": "whistler-nocturne-chelsea",
        "title": "夜曲：蓝与银·切尔西",
        "artist": "詹姆斯·惠斯勒",
        "year": "1871",
        "thumbnail": "art/whistler-nocturne-chelsea-thumb.jpg",
        "image": "art/whistler-nocturne-chelsea.jpg",
        "alt": "惠斯勒《夜曲：蓝与银·切尔西》，泰晤士河暮色中一片朦胧的蓝，岸边人影极淡",
        "source": "伦敦泰特美术馆藏，公共领域。图片来源：Wikimedia Commons "
                  + _C + "James_Abbott_McNeill_Whistler_-_Nocturne-_Blue_and_Silver_-"
                         "_Chelsea_-_Google_Art_Project.jpg",
        "article": "惠斯勒借用音乐的词，把这类画叫作「夜曲」。"
                   "他要的不是画清楚河上有什么，而是画出天快黑时看东西的那种费力。"
                   "眼睛开始看不清的时候，也就是该睡了。",
    },
]
