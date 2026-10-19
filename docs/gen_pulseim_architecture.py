# -*- coding: utf-8 -*-
"""PulseIM 技术架构文档生成脚本 (reportlab).
用法: python docs/gen_pulseim_architecture.py
输出: output/pdf/PulseIM-技术架构文档.pdf
"""
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "output", "pdf")
TMP_DIR = os.path.join(ROOT, "tmp", "pdfs")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(TMP_DIR, exist_ok=True)

OUT_PDF = os.path.join(OUT_DIR, "PulseIM-技术架构文档.pdf")

# ---------------------------------------------------------------- fonts
pdfmetrics.registerFont(TTFont("MSYH", r"C:\Windows\Fonts\msyh.ttc", subfontIndex=0))
pdfmetrics.registerFont(TTFont("MSYHBD", r"C:\Windows\Fonts\msyhbd.ttc", subfontIndex=0))
pdfmetrics.registerFont(TTFont("SimHei", r"C:\Windows\Fonts\simhei.ttf"))

PRIMARY = colors.HexColor("#1F4E79")
SECONDARY = colors.HexColor("#2E75B6")
LIGHT = colors.HexColor("#DEEBF7")
LIGHTER = colors.HexColor("#F2F7FC")
TEXT = colors.HexColor("#333333")
LINE = colors.HexColor("#BFBFBF")
GOOD = colors.HexColor("#2E7D32")


def st(name, **kw):
    base = dict(fontName="MSYH", fontSize=9.5, leading=15, textColor=TEXT,
                alignment=TA_LEFT, spaceAfter=4)
    base.update(kw)
    return ParagraphStyle(name, **base)


S = {
    "title": st("title", fontName="SimHei", fontSize=26, leading=36, alignment=TA_CENTER,
                textColor=PRIMARY, spaceAfter=8),
    "subtitle": st("subtitle", fontSize=12, leading=18, alignment=TA_CENTER,
                   textColor=SECONDARY, spaceAfter=2),
    "h1": st("h1", fontName="SimHei", fontSize=16, leading=22, textColor=PRIMARY,
             spaceBefore=14, spaceAfter=8),
    "h2": st("h2", fontName="SimHei", fontSize=13, leading=18, textColor=SECONDARY,
             spaceBefore=10, spaceAfter=5),
    "h3": st("h3", fontName="SimHei", fontSize=11, leading=15, textColor=TEXT,
             spaceBefore=7, spaceAfter=3),
    "body": st("body"),
    "bullet": st("bullet", leftIndent=12, bulletIndent=4, spaceAfter=2),
    "small": st("small", fontSize=8.5, leading=13, textColor=colors.HexColor("#666666")),
    "code": st("code", fontName="MSYH", fontSize=8, leading=12,
               textColor=colors.HexColor("#1F1F1F"), backColor=LIGHTER,
               borderPadding=4, leftIndent=6),
    "cell": st("cell", fontSize=8.5, leading=12, spaceAfter=0),
    "cellh": st("cellh", fontName="MSYHBD", fontSize=8.5, leading=12,
                spaceAfter=0, textColor=colors.white),
    "toc1": st("toc1", fontName="MSYH", fontSize=10.5, leading=18),
    "toc2": st("toc2", fontSize=9.5, leading=16, leftIndent=14),
}


def P(text, style="body"):
    return Paragraph(text, S[style])


def cell(text, header=False):
    return Paragraph(str(text), S["cellh" if header else "cell"])


def wrap_table(rows, header_rows=1):
    out = []
    for i, row in enumerate(rows):
        out.append([cell(x, header=(i < header_rows)) for x in row])
    return out


def B(text):
    return Paragraph(text, S["bullet"], bulletText="\u2022")


# ---------------------------------------------------------------- cover
def cover_story():
    story = []
    story.append(Spacer(1, 3.2 * cm))
    story.append(Paragraph("PulseIM 脉冲即时通讯平台", S["title"]))
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph("技术架构设计文档", S["title"]))
    story.append(Spacer(1, 1.2 * cm))
    story.append(HRFlowable(width="60%", thickness=1.2, color=SECONDARY,
                            hAlign="CENTER", spaceBefore=6, spaceAfter=14))
    story.append(Paragraph("技术栈总览 - 前后端架构 - IM 实时通信处理方式 - 部署与容量", S["subtitle"]))
    story.append(Spacer(1, 2.6 * cm))
    info = Table([
        ["文档版本", "v1.0"],
        ["编制日期", "2026-08-06"],
        ["适用范围", "PulseIM 研发 / 运维 / 架构评审"],
        ["密级", "内部资料"],
    ], colWidths=[4.0 * cm, 8.0 * cm])
    info.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "MSYH"),
        ("FONTSIZE", (0, 0), (-1, -1), 10.5),
        ("TEXTCOLOR", (0, 0), (0, -1), SECONDARY),
        ("TEXTCOLOR", (1, 0), (1, -1), TEXT),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINE),
        ("ALIGN", (0, 0), (0, -1), "RIGHT"),
    ]))
    info.hAlign = "CENTER"
    story.append(info)
    story.append(Spacer(1, 2.8 * cm))
    story.append(Paragraph("PulseIM 商业级即时通讯平台", S["small"]))
    story.append(PageBreak())
    return story


# ---------------------------------------------------------------- TOC
class Doc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            if style == "h1":
                self.notify("TOCEntry", (0, flowable.getPlainText(), self.page))
            elif style == "h2":
                self.notify("TOCEntry", (1, flowable.getPlainText(), self.page))


def toc_story():
    toc = TableOfContents()
    toc.levelStyles = [S["toc1"], S["toc2"]]
    story = [P("目录", "h1"), toc, PageBreak()]
    return story


# ---------------------------------------------------------------- diagrams
def _box(d, x, y, w, h, label, fill=LIGHT, text_color=PRIMARY, font="MSYH", size=9):
    from reportlab.graphics.shapes import Rect, String
    d.add(Rect(x, y, w, h, fillColor=fill, strokeColor=SECONDARY, strokeWidth=0.8,
               rx=2, ry=2))
    lines = label.split("\n")
    line_h = size + 2.5
    start_y = y + h / 2.0 + (len(lines) - 1) * line_h / 2.0 - size / 2.5
    for i, ln in enumerate(lines):
        d.add(String(x + w / 2.0, start_y - i * line_h, ln, textAnchor="middle",
                     fontName=font, fontSize=size, fillColor=text_color))


def _label(d, x, y, text, size=9, color=PRIMARY):
    from reportlab.graphics.shapes import String
    d.add(String(x, y, text, fontName="MSYHBD", fontSize=size, fillColor=color))


def architecture_diagram():
    from reportlab.graphics.shapes import Drawing, Line
    from reportlab.graphics import renderPDF
    d = Drawing(17.0 * cm, 10.4 * cm)
    W = 17.0 * cm
    left = 0.4 * cm
    box_w = 4.0 * cm
    box_h = 1.15 * cm
    # 客户端层
    _box(d, left, 8.9 * cm, box_w, box_h, "浏览器 H5\n(Vue3 + Vant)", LIGHT)
    _box(d, left + 5.2 * cm, 8.9 * cm, box_w, box_h, "Android App\n(Capacitor)", LIGHT)
    _box(d, left + 10.4 * cm, 8.9 * cm, box_w, box_h, "管理后台 Web\n(Vue3 + Element Plus)", LIGHT)
    # 接入层
    _box(d, left + 4.0 * cm, 6.9 * cm, 9.0 * cm, box_h, "Nginx 接入层\nHTTPS / WSS 反向代理 / TLS 终止", colors.HexColor("#FFF2CC"), colors.HexColor("#BF8F00"))
    d.add(Line(left + 2.0 * cm, 8.9 * cm, left + 6.0 * cm, 8.05 * cm, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 7.2 * cm, 8.9 * cm, left + 8.0 * cm, 8.05 * cm, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 12.4 * cm, 8.9 * cm, left + 10.0 * cm, 8.05 * cm, strokeColor=SECONDARY, strokeWidth=1))
    # 应用层
    _box(d, left, 5.0 * cm, box_w + 1.0 * cm, 1.25 * cm, "pulse-api\nSpring Boot REST 业务层", colors.HexColor("#E2EFDA"), colors.HexColor("#538135"))
    _box(d, left + 6.5 * cm, 5.0 * cm, box_w + 1.0 * cm, 1.25 * cm, "pulse-im-server\nNetty WebSocket 实时通道", colors.HexColor("#E2EFDA"), colors.HexColor("#538135"))
    _box(d, left + 12.0 * cm, 5.0 * cm, box_w + 1.0 * cm, 1.25 * cm, "pulse-proto / common\n协议定义 / 通用组件", colors.HexColor("#E2EFDA"), colors.HexColor("#538135"))
    d.add(Line(left + 8.5 * cm, 6.9 * cm, left + 5.0 * cm, 6.25 * cm, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 8.5 * cm, 6.9 * cm, left + 11.5 * cm, 6.25 * cm, strokeColor=SECONDARY, strokeWidth=1))
    # 数据层
    _box(d, left, 2.8 * cm, 3.2 * cm, 1.15 * cm, "PostgreSQL 16\n业务数据", colors.HexColor("#FCE4EC"), colors.HexColor("#AD1457"))
    _box(d, left + 4.3 * cm, 2.8 * cm, 3.2 * cm, 1.15 * cm, "Redis 7\n缓存/在线/队列/推送", colors.HexColor("#FCE4EC"), colors.HexColor("#AD1457"))
    _box(d, left + 8.6 * cm, 2.8 * cm, 3.2 * cm, 1.15 * cm, "MinIO\n对象存储(文件/媒体)", colors.HexColor("#FCE4EC"), colors.HexColor("#AD1457"))
    _box(d, left + 12.9 * cm, 2.8 * cm, 3.2 * cm, 1.15 * cm, "Elasticsearch\n(可选)搜索", colors.HexColor("#FCE4EC"), colors.HexColor("#AD1457"))
    d.add(Line(left + 4.5 * cm, 5.0 * cm, left + 1.6 * cm, 3.95 * cm, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 4.5 * cm, 5.0 * cm, left + 5.9 * cm, 3.95 * cm, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 11.5 * cm, 5.0 * cm, left + 10.2 * cm, 3.95 * cm, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 11.5 * cm, 5.0 * cm, left + 14.5 * cm, 3.95 * cm, strokeColor=SECONDARY, strokeWidth=1))
    # 辅助服务
    _box(d, left + 1.5 * cm, 0.6 * cm, 5.2 * cm, 1.15 * cm, "coturn 4.6.2\nSTUN/TURN 音视频穿透", LIGHTER, TEXT, size=8.5)
    _box(d, left + 8.0 * cm, 0.6 * cm, 5.2 * cm, 1.15 * cm, "ASR (whisper)\n语音转写服务", LIGHTER, TEXT, size=8.5)
    d.add(Line(left + 12.4 * cm, 2.8 * cm, left + 11.0 * cm, 1.75 * cm, strokeColor=colors.HexColor("#999999"), strokeWidth=0.8))
    d.add(Line(left + 4.0 * cm, 2.8 * cm, left + 4.0 * cm, 1.75 * cm, strokeColor=colors.HexColor("#999999"), strokeWidth=0.8))
    return d


def im_flow_diagram():
    from reportlab.graphics.shapes import Drawing, Line
    d = Drawing(17.0 * cm, 7.6 * cm)
    left = 0.4 * cm
    w1 = 3.0 * cm
    h = 1.3 * cm
    y1 = 5.7 * cm
    y2 = 3.1 * cm
    y3 = 0.8 * cm
    # 行1: 发送链路
    _box(d, left, y1, w1, h, "客户端\nSEND_MSG", LIGHT)
    _box(d, left + 4.0 * cm, y1, w1, h, "Netty 事件循环\n只读校验 + 入队", colors.HexColor("#E2EFDA"), colors.HexColor("#538135"), size=8.5)
    _box(d, left + 8.0 * cm, y1, w1, h, "Redis Stream\npulse:im:msg:stream", colors.HexColor("#FFF2CC"), colors.HexColor("#BF8F00"), size=8.5)
    _box(d, left + 12.0 * cm, y1, w1, h, "批量消费者\n(50ms 轮询)", colors.HexColor("#E2EFDA"), colors.HexColor("#538135"), size=8.5)
    _box(d, left + 16.0 * cm - 0.4 * cm, y1, 1.4 * cm, h, "PostgreSQL\n批量落库", colors.HexColor("#FCE4EC"), colors.HexColor("#AD1457"), size=8.5)
    d.add(Line(left + w1, y1 + h / 2, left + 4.0 * cm, y1 + h / 2, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 7.0 * cm, y1 + h / 2, left + 8.0 * cm, y1 + h / 2, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 11.0 * cm, y1 + h / 2, left + 12.0 * cm, y1 + h / 2, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 15.0 * cm, y1 + h / 2, left + 16.0 * cm - 0.4 * cm, y1 + h / 2, strokeColor=SECONDARY, strokeWidth=1))
    _label(d, left + 0.1 * cm, y1 + h + 0.35 * cm, "1) 发送与异步落库")
    # 行2: ACK + 推送
    _box(d, left + 4.0 * cm, y2, w1, h, "立即回 ACK\n(MSG_ACK)", colors.HexColor("#E2EFDA"), colors.HexColor("#538135"), size=8.5)
    _box(d, left + 8.0 * cm, y2, w1, h, "Redis 广播\npulse:im:push", colors.HexColor("#FFF2CC"), colors.HexColor("#BF8F00"), size=8.5)
    _box(d, left + 12.0 * cm, y2, w1, h, "各 IM 节点监听\n投递本机在线用户", colors.HexColor("#E2EFDA"), colors.HexColor("#538135"), size=8.5)
    _box(d, left + 16.0 * cm - 0.4 * cm, y2, 1.4 * cm, h, "对端客户端\nPUSH_MSG", LIGHT, size=8.5)
    _label(d, left + 0.1 * cm, y2 + h + 0.35 * cm, "2) ACK 与多节点推送")
    d.add(Line(left + 5.5 * cm, y1, left + 5.5 * cm, y2 + h, strokeColor=colors.HexColor("#999999"), strokeWidth=0.7, strokeDashArray=[2, 2]))
    d.add(Line(left + 9.5 * cm, y1, left + 9.5 * cm, y2 + h, strokeColor=colors.HexColor("#999999"), strokeWidth=0.7, strokeDashArray=[2, 2]))
    d.add(Line(left + 13.5 * cm, y1, left + 13.5 * cm, y2 + h, strokeColor=colors.HexColor("#999999"), strokeWidth=0.7, strokeDashArray=[2, 2]))
    d.add(Line(left + 5.5 * cm, y2 + h / 2, left + 8.0 * cm, y2 + h / 2, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 11.0 * cm, y2 + h / 2, left + 12.0 * cm, y2 + h / 2, strokeColor=SECONDARY, strokeWidth=1))
    d.add(Line(left + 15.0 * cm, y2 + h / 2, left + 16.0 * cm - 0.4 * cm, y2 + h / 2, strokeColor=SECONDARY, strokeWidth=1))
    # 行3: 兜底
    _label(d, left + 0.1 * cm, y3 + h + 0.35 * cm, "3) 可靠性保障")
    _box(d, left, y3, 5.0 * cm, h, "Redis 故障: 回退同步落库(单事务)", LIGHTER, TEXT, size=8.5)
    _box(d, left + 6.0 * cm, y3, 5.0 * cm, h, "崩溃恢复: XCLAIM 回收 pending 消息", LIGHTER, TEXT, size=8.5)
    _box(d, left + 12.0 * cm, y3, 5.0 * cm, h, "幂等: client_msg_id 索引去重", LIGHTER, TEXT, size=8.5)
    return d


# ---------------------------------------------------------------- content
def content_story():
    story = []

    # 1 项目概述
    story.append(P("1. 项目概述", "h1"))
    story.append(P(
        "PulseIM（脉冲）是一个商业级即时通讯平台，提供用户端 H5 / Android、管理后台、REST 业务 API "
        "与独立 Netty IM 实时通道。系统覆盖账号体系、单聊与群聊、好友关系、朋友圈动态、音视频通话信令、"
        "阅后即焚、钱包、文件传输、语音转写等能力，并配套完整的管理运营后台。"))
    story.append(P(
        "核心设计原则：HTTP 业务与 WebSocket 实时通道解耦，消息链路独立演进；"
        "IM 协议使用 Protobuf 定义并以 JSON 文本帧兼容 Web 客户端；"
        "消息持久化从同步写库演进为异步批量落库，保证连接容量与消息吞吐的平衡。"))
    story.append(P("项目仓库目录构成", "h2"))
    story.append(B("backend: Maven 多模块后端（pulse-common / pulse-proto / pulse-api / pulse-im-server）"))
    story.append(B("frontend: 用户端 H5（mobile）与管理后台（admin）"))
    story.append(B("deploy: Docker Compose、Nginx、PostgreSQL 初始化 SQL、生产部署脚本"))
    story.append(B("android: Capacitor 生成的 Android 原生工程"))

    # 2 技术栈
    story.append(P("2. 技术栈总览", "h1"))
    rows = [
        ["层次", "技术选型", "版本", "用途"],
        ["后端语言", "Java", "21", "API 与 IM 服务统一使用"],
        ["后端框架", "Spring Boot", "3.3.5", "自动装配 / Web / 安全 / 数据访问"],
        ["ORM", "MyBatis-Plus", "3.5.9", "REST 业务数据访问与分页"],
        ["实时通信", "Netty", "4.1.114.Final", "WebSocket 长连接与协议编解码"],
        ["协议序列化", "Google Protobuf", "3.25.5", "IM 帧定义（兼容 JSON 文本帧）"],
        ["认证令牌", "jjwt", "0.12.6", "HS256 JWT 签发与校验"],
        ["数据库", "PostgreSQL", "16", "业务数据主存储"],
        ["缓存/队列", "Redis", "7", "在线状态、异步消息队列、pub/sub 推送"],
        ["对象存储", "MinIO", "8.5.12", "头像 / 图片 / 视频 / 文件"],
        ["搜索", "Elasticsearch", "starter", "可选全文检索"],
        ["音视频", "coturn", "4.6.2", "WebRTC STUN/TURN 穿透"],
        ["语音转写", "whisper (HF)", "-", "语音消息 ASR 服务"],
        ["前端框架", "Vue 3", "3.5.13", "H5 与后台共用"],
        ["移动端 UI", "Vant", "4.9.15", "用户端组件库"],
        ["后台 UI", "Element Plus", "2.9.1", "管理后台组件库"],
        ["状态/路由", "Pinia / Vue Router", "2.3 / 4.5", "前端状态与路由"],
        ["构建工具", "Vite + TypeScript", "6 / 5.6", "前端工程化"],
        ["移动端打包", "Capacitor", "8.4", "Android 原生壳与系统能力"],
        ["部署", "Docker Compose + Nginx", "1.27", "容器编排与反向代理"],
    ]
    tbl = Table(wrap_table(rows), colWidths=[2.6 * cm, 5.2 * cm, 3.0 * cm, 6.2 * cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "MSYHBD"),
        ("FONTNAME", (0, 1), (-1, -1), "MSYH"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHTER]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tbl)

    # 3 整体架构
    story.append(P("3. 系统整体架构", "h1"))
    story.append(architecture_diagram())
    story.append(P("图 3-1 PulseIM 分层架构图", "small"))
    story.append(P("架构分层说明", "h2"))
    story.append(B("客户端层: 浏览器 H5（Vue3 + Vant）、Android App（Capacitor 壳）、管理后台 Web（Vue3 + Element Plus）。"))
    story.append(B("接入层: Nginx 统一入口，HTTP/HTTPS 与 WebSocket(WSS) 反向代理，TLS 终止、静态资源与上传文件服务。"))
    story.append(B("应用层: pulse-api（Spring Boot REST 业务）与 pulse-im-server（Netty WebSocket 实时通道）相互独立，仅通过数据库 / Redis 协作。"))
    story.append(B("数据层: PostgreSQL 业务数据、Redis 在线状态与消息队列、MinIO 对象存储、Elasticsearch 可选搜索。"))
    story.append(B("辅助服务: coturn 提供音视频 NAT 穿透，ASR(whisper) 提供语音转写。"))
    story.append(P("典型请求链路", "h2"))
    story.append(P(
        "登录与业务: 客户端 -> Nginx(/api) -> pulse-api -> PostgreSQL / Redis / MinIO；"
        "登录成功签发 JWT，并携带 token 建立 WebSocket 连接。"))
    story.append(P(
        "实时消息: 客户端 -> Nginx(/ws) -> pulse-im -> 校验入队(Redis Stream) -> 立即 ACK；"
        "后台批量消费者落库 PostgreSQL；推送经 Redis pub/sub 广播后由各节点投递本机在线用户。"))

    # 4 后端架构
    story.append(P("4. 后端架构", "h1"))
    story.append(P("4.1 模块划分", "h2"))
    mods = [
        ["模块", "职责"],
        ["pulse-common", "通用 Result/JWT/Redis Key/异常/Security 常量"],
        ["pulse-proto", "im.proto 协议定义与生成的 Java 类（ImEnvelope/ChatMessage/AuthPayload 等）"],
        ["pulse-api", "Spring Boot 3 业务 REST：认证、会话、好友、群、动态、钱包、文件、管理后台"],
        ["pulse-im-server", "独立 Netty WebSocket 服务：连接管理、协议编解码、消息入队、批量落库、推送"],
    ]
    mt = Table(wrap_table(mods), colWidths=[3.4 * cm, 13.6 * cm])
    mt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "MSYHBD"),
        ("FONTNAME", (0, 1), (-1, -1), "MSYH"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHTER]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(mt)
    story.append(P("4.2 pulse-api 业务能力", "h2"))
    story.append(B("账号认证: 密码登录、短信登录/注册、token 刷新/登出、JWT + 安全码 + 信任设备、登录失败锁定。"))
    story.append(B("会话: 单聊/群聊会话、未读数、置顶/隐藏/归档、会话同步、阅后即焚设置与倒计时、已读回执。"))
    story.append(B("关系链: 好友申请/同意/拒绝、备注、拉黑、好友搜索（手机号/PulseID/二维码/名片）。"))
    story.append(B("群组: 建群/退群/解散、成员管理、全员禁言、成员禁言、群主转让、入群验证。"))
    story.append(B("动态朋友圈: 发帖/图片/可见范围、评论、点赞、互动未读、动态更新通知。"))
    story.append(B("钱包: 余额、收支流水、支付密码（可与消息/转账联动）。"))
    story.append(B("文件与媒体: 预签名上传（头像/图片/视频/文件）、文件访问、APK 版本发布。"))
    story.append(B("音视频通话: WebRTC 信令（走 Redis 推送）、通话记录、铃声、通话设置。"))
    story.append(B("管理后台: 用户/消息/群/敏感词/版本/地图配置、操作审计、登录日志、数据看板。"))
    story.append(P("4.3 pulse-im-server 职责", "h2"))
    story.append(B("基于 Netty 的 WebSocket 服务（端口 9001，路径 /ws），HTTP 升级为长连接。"))
    story.append(B("同时支持 Protobuf 二进制帧与 JSON 文本帧（Web 客户端），统一转为 ImEnvelope 处理。"))
    story.append(B("会话管理、在线状态（Redis 记录节点+连接）、心跳保活、同账号踢线。"))
    story.append(B("消息校验 -> 入队 -> 立即 ACK -> 广播推送 -> 批量落库（详见第 5 章）。"))

    # 5 IM 详细设计
    story.append(P("5. IM 实时通信详细设计", "h1"))
    story.append(P("5.1 协议设计", "h2"))
    story.append(P(
        "IM 帧统一为 Protobuf 的 ImEnvelope（cmd / seq / timestamp / payload），"
        "命令定义在 im.proto 中；Web 客户端发送 JSON 文本帧，由 JsonImBridge 转换为 ImEnvelope，"
        "出站方向按客户端类型自动输出 JSON 或二进制。"))
    cmds = [
        ["命令", "方向", "说明"],
        ["AUTH / AUTH_ACK", "C -> S / S -> C", "携带 JWT 认证，成功后绑定用户与会话"],
        ["HEARTBEAT / HEARTBEAT_ACK", "C <-> S", "30s 心跳，刷新在线状态与 TTL"],
        ["SEND_MSG", "C -> S", "发送消息（conversationId/toUserId/msgType/content/clientMsgId）"],
        ["MSG_ACK", "S -> C", "消息回执（clientMsgId + msgId + success）"],
        ["PUSH_MSG", "S -> C", "对端消息推送（含撤回/阅后即焚等扩展字段）"],
        ["KICK", "S -> C", "同账号异地登录踢线"],
        ["ERROR", "S -> C", "业务错误（未认证/越权/敏感词等）"],
    ]
    ct = Table(wrap_table(cmds), colWidths=[3.8 * cm, 2.4 * cm, 10.8 * cm])
    ct.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "MSYHBD"),
        ("FONTNAME", (0, 1), (-1, -1), "MSYH"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHTER]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]))
    story.append(ct)
    story.append(P("消息类型 MsgType: 0 文本 / 1 图片 / 2 文件 / 3 语音 / 4 聊天记录 / 5 名片 / 6 位置 / 9 通话。", "small"))

    story.append(P("5.2 连接与会话管理", "h2"))
    story.append(P(
        "SessionManager 以 ConcurrentHashMap 维护 userId -> Channel 与 channelId -> userId 的双向映射。"
        "AUTH 成功后先绑定并标记在线（Redis 写入 node:channel，TTL 为心跳超时的两倍），再踢掉旧连接，"
        "避免旧连接的关闭事件误清在线状态。离线时保留 20 秒重连宽限期。"))

    story.append(P("5.3 消息发送链路（当前生产实现）", "h2"))
    story.append(im_flow_diagram())
    story.append(P("图 5-1 IM 消息发送/落库/推送流程图", "small"))
    story.append(P("发送校验（事件循环内，只读）", "h3"))
    story.append(B("会话与成员校验合并为一条 SQL: 会话类型/全员禁言 + 成员角色/禁言 + 私聊对方 + 好友/拉黑状态。"))
    story.append(B("内容校验: 消息类型白名单、长度上限 5000、敏感词（内存缓存，每 60 秒刷新）。"))
    story.append(B("私聊目标校验: toUserId 必须等于会话对端；非好友或拉黑直接拒绝。"))
    story.append(P("入队与 ACK", "h3"))
    story.append(P(
        "校验通过后生成 msgId 并将消息 XADD 到 Redis Stream（pulse:im:msg:stream，近似 MAXLEN 10 万自动裁剪），"
        "随后立即回 MSG_ACK 并广播推送。Redis 不可用时回退为同步单事务落库，保证消息不丢。"))
    story.append(P("批量落库（ImMessageBatchConsumer）", "h3"))
    story.append(B("每 50ms 通过 XREADGROUP（消费组 im-persist）批量读取最多 200 条。"))
    story.append(B("单事务执行: 批量 INSERT im_message + 会话最新消息更新 + 成员未读数/隐藏状态更新，一次 commit。"))
    story.append(B("成功后 XACK；失败保留 pending 自动重试，超过 5 次丢弃并告警（防毒消息）。"))
    story.append(B("每 60s 扫描其他消费者的 pending 并通过 XCLAIM 回收，支持节点崩溃恢复。"))
    story.append(B("幂等: client_msg_id + from_user_id + conversation_id 去重索引（v65 迁移），批量消费者内二次去重。"))
    story.append(P("多节点推送（P2）", "h3"))
    story.append(P(
        "发送方不回查本地会话表直接推送，而是将 PUSH 载荷 publish 到 Redis 频道 pulse:im:push；"
        "所有 IM 节点订阅该频道，由持有目标用户连接的本机节点投递。该设计使 IM 服务可水平扩展，"
        "API 侧的文件/好友/动态等推送也复用同一通道。"))
    story.append(P("心跳与超时", "h3"))
    story.append(P(
        "服务端 IdleStateHandler 心跳超时 90 秒；客户端 30 秒发送心跳。"
        "心跳同时刷新 Redis 在线 TTL 与 last_online 时间。"))

    # 6 前端架构
    story.append(P("6. 前端架构", "h1"))
    story.append(P("6.1 用户端 H5 / Android（frontend/mobile）", "h2"))
    story.append(B("技术: Vue 3.5 + TypeScript + Vite 6 + Pinia + Vue Router + Axios + Vant 4。"))
    story.append(B("移动端能力: Capacitor 8 提供相机、相册、文件系统、本地通知、键盘、网络状态、屏幕方向、状态栏等原生能力。"))
    story.append(B("IM 通信层: src/im/ws.ts 封装 WebSocket 连接（AUTH/心跳/重连/断线待发），messageOutbox 做本地消息队列与补发。"))
    story.append(B("协议: 生产环境使用 WSS（https://39.97.240.31:6080/ws），JSON 文本帧与服务端互通。"))
    story.append(P("6.2 管理后台（frontend/admin）", "h2"))
    story.append(B("技术: Vue 3.5 + TypeScript + Vite 6 + Pinia + Element Plus 2.9 + Axios。"))
    story.append(B("能力: 用户管理、消息审计、群管理、敏感词、版本发布、地图配置、登录日志、操作审计。"))
    story.append(P("6.3 前端与后端的边界", "h2"))
    story.append(P(
        "REST（/api）负责账号、资料、关系链、历史消息、文件等强一致业务；"
        "WebSocket（/ws）只负责实时消息与在线信令。前端以 REST 拉取初始数据，以 WS 接收增量事件，"
        "两者通过 msgId/clientMsgId 对齐，断线重连后以最后收到的消息游标补拉。"))

    # 7 数据存储
    story.append(P("7. 数据存储设计", "h1"))
    story.append(P("7.1 PostgreSQL 核心表", "h2"))
    tbls = [
        ["表", "说明", "关键字段/索引"],
        ["sys_user", "用户账号", "phone 唯一、pulse_id 唯一、状态、安全码、钱包"],
        ["sys_admin", "管理员账号", "username 唯一、权限"],
        ["im_conversation", "会话（1 私聊 / 2 群聊）", "type、last_msg_preview、mute_all"],
        ["im_conversation_member", "会话成员", "conversation_id+user_id 唯一、未读数、角色、peer_user_id"],
        ["im_message", "消息", "msg_id 唯一、(conversation_id, send_time) 索引、client_msg_id 去重索引"],
        ["im_friend / im_friend_request", "好友关系/申请", "user_id+friend_id 唯一"],
        ["im_user_block", "拉黑", "user_id+blocked_user_id 唯一"],
        ["moment_post / comment / like", "朋友圈", "发帖/评论/点赞、可见范围"],
        ["im_burn_after_read_setting", "阅后即焚设置", "user_id+conversation_id 唯一"],
        ["sys_sensitive_word", "敏感词库", "enabled 标记"],
        ["pulse_schema_version", "Schema 迁移版本", "逐版本递增（当前 v65）"],
    ]
    tt = Table(wrap_table(tbls), colWidths=[4.6 * cm, 4.4 * cm, 8.0 * cm])
    tt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "MSYHBD"),
        ("FONTNAME", (0, 1), (-1, -1), "MSYH"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHTER]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(tt)
    story.append(P("7.2 Redis Key 设计", "h2"))
    keys = [
        ["Key", "用途", "TTL"],
        ["pulse:online:{userId}", "在线状态（node:channel）", "心跳超时 x2"],
        ["pulse:conn:{userId}", "连接定位", "心跳超时 x2"],
        ["pulse:last_online:{userId}", "最近在线时间", "持久"],
        ["pulse:user:auth_version:{userId}", "令牌版本（登出/改密失效）", "持久"],
        ["pulse:sms:{phone}", "短信验证码", "可配"],
        ["pulse:auth:fail:/lock:", "登录失败计数与锁定", "15 分钟"],
        ["pulse:im:msg:stream", "消息异步落库队列（Stream）", "近似 10 万裁剪"],
        ["pulse:im:push", "推送广播频道（pub/sub）", "-"],
        ["pulse:token:bl", "令牌黑名单", "-"],
    ]
    kt = Table(wrap_table(keys), colWidths=[6.2 * cm, 7.2 * cm, 3.6 * cm])
    kt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "MSYHBD"),
        ("FONTNAME", (0, 1), (-1, -1), "MSYH"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHTER]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(kt)

    # 8 部署架构
    story.append(P("8. 部署架构", "h1"))
    story.append(P("8.1 生产服务拓扑", "h2"))
    deps = [
        ["服务", "镜像/产物", "端口映射", "说明"],
        ["nginx", "nginx:1.27-alpine", "8080->443, 8081->80, 443, 8443", "统一入口，TLS 终止，/api 与 /ws 反向代理"],
        ["pulse-api", "pulse-api jar", "容器内 8080", "Spring Boot REST"],
        ["pulse-im", "pulse-im-server jar", "容器内 9001", "Netty WebSocket /ws"],
        ["postgres", "postgres:16-alpine", "容器内 5432", "业务库 pulseim（卷持久化）"],
        ["redis", "redis:7-alpine", "容器内 6379", "在线状态/队列/推送"],
        ["minio", "minio", "容器内 9000", "对象存储（可选 profile）"],
        ["coturn", "coturn:4.6.2", "3478, 49160-49200/udp", "音视频穿透"],
        ["asr", "whisper 服务", "容器内 3978", "语音转写"],
        ["mobile / admin", "静态站点 nginx", "容器内 80", "前端资源"],
    ]
    dt = Table(wrap_table(deps), colWidths=[2.8 * cm, 4.0 * cm, 4.2 * cm, 6.0 * cm])
    dt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "MSYHBD"),
        ("FONTNAME", (0, 1), (-1, -1), "MSYH"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHTER]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(dt)
    story.append(P("8.2 Nginx 路由规则", "h2"))
    story.append(P("/api/ -> pulse-api:8080（REST）；/ws -> pulse-im:9001（WebSocket 升级）；"
                   "/admin/ -> admin 前端；/ -> mobile 前端；/api/v1/files/raw/*.apk -> 上传文件目录。", "code"))
    story.append(P("8.3 生产环境参数（已调优）", "h2"))
    story.append(B("PostgreSQL: shared_buffers=2GB、work_mem=16MB、maintenance_work_mem=256MB、synchronous_commit=off、max_connections=150。"))
    story.append(B("Nginx: worker_connections=4096、listen backlog=4096、worker_rlimit_nofile=65535；主机 net.core.somaxconn=4096。"))
    story.append(B("IM 数据源: HikariCP maximum-pool-size=40、minimum-idle=10。"))

    # 9 安全
    story.append(P("9. 认证与安全", "h1"))
    story.append(B("JWT: HS256 签名，claims 含 uid/role/authVersion/sub；IM 与 API 使用同一密钥校验。"))
    story.append(B("令牌失效: 登出/改密/封禁通过 authVersion 比对与令牌黑名单实现，密码重置自增版本。"))
    story.append(B("登录防护: 失败次数锁定（5 次/15 分钟）、短信验证码、可选安全码 + 信任设备。"))
    story.append(B("内容安全: 敏感词拦截（内存缓存）、消息长度限制、私聊权限校验（好友/拉黑）、群禁言校验。"))
    story.append(B("越权防护: 会话成员校验拒绝越权发消息；管理端独立鉴权与操作审计。"))
    story.append(B("传输安全: 全站 HTTPS/WSS，TLS 终止于 Nginx。"))

    # 10 并发与容量
    story.append(P("10. 并发能力与容量", "h1"))
    story.append(P("10.1 压测方法与场景", "h2"))
    story.append(P(
        "压测工具为自研 WebSocket 压测客户端（tools/stress-test），仅发送纯文本消息（msgType=0），"
        "单用户约 1 条/秒。场景为 1000 与 2000 并发在线用户，发消息阶段 60 秒，"
        "统计连接成功率、ACK 率、ACK 延迟、对端推送送达率。生成器部署在服务器本机走完整链路 "
        "（nginx -> Netty -> PostgreSQL），避免本地运营商单 IP 并发上限干扰。"))
    story.append(P("10.2 优化前基线（单机 4 核 / 7.5GB）", "h2"))
    base = [
        ["指标", "1000 并发", "2000 并发"],
        ["连接成功", "1000/1000", "1926/2000（尾段握手失败）"],
        ["ACK 率", "66.4%", "31.8%"],
        ["ACK 延迟 p50", "12.6s", "15.7s"],
        ["对端推送送达", "34.6%", "13.3%"],
        ["超时未 ACK", "17,613", "68,902"],
    ]
    bt = Table(wrap_table(base), colWidths=[4.8 * cm, 6.0 * cm, 6.2 * cm])
    bt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "MSYHBD"),
        ("FONTNAME", (0, 1), (-1, -1), "MSYH"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHTER]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(bt)
    story.append(P("10.3 优化后结果（当前生产版本）", "h2"))
    after = [
        ["指标", "1000 并发", "2000 并发"],
        ["连接成功", "1000/1000", "2000/2000"],
        ["建连+认证耗时", "10.5s", "15.2s"],
        ["ACK 率", "97.5%", "62.7%"],
        ["ACK 延迟 p50", "15.8s", "13.8s"],
        ["对端推送送达", "79.3%", "25.9%"],
        ["超时未 ACK", "1,329", "38,939"],
    ]
    at = Table(wrap_table(after), colWidths=[4.8 * cm, 6.0 * cm, 6.2 * cm])
    at.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "MSYHBD"),
        ("FONTNAME", (0, 1), (-1, -1), "MSYH"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), GOOD),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHTER]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(at)
    story.append(P("10.4 已实施的优化（P0 / P1 / P2）", "h2"))
    story.append(B("P0: 消息落库单事务、敏感词内存缓存、Hikari 40、PostgreSQL 参数调优、nginx 连接参数调优。"))
    story.append(B("P1: 消息异步化 - Redis Stream 入队后立即 ACK，后台批量单事务落库；校验查询合并为一条 SQL；client_msg_id 去重索引。"))
    story.append(B("P2: 推送走 Redis pub/sub 广播，支持多 IM 节点水平扩展；推送监听线程池。"))
    story.append(P("10.5 容量结论与扩展方向", "h2"))
    story.append(P(
        "单机 4 核环境的持续消息吞吐上限约 850-900 条/秒，主要受事件循环上的 DB/Redis 串行调用与总 CPU 约束。"
        "1000 并发（约 874 条/秒）基本贴近上限；2000 并发（约 1,739 条/秒）超出上限，多余消息排队导致延迟升高，"
        "但消息最终全部落库不丢失。"))
    story.append(B("横向扩展: 增加 IM 节点（推送已走 Redis 广播，多节点可直接部署）分摊连接与入队压力。"))
    story.append(B("纵向扩容: 提升 CPU 核数/内存，扩大 PG 缓冲池，天花板可随核数近似线性上升。"))
    story.append(B("进一步优化: 事件循环异步化（异步驱动 DB/Redis 调用）、会话路由缓存、PG 只读副本与分库分表。"))

    # 附录 A
    story.append(P("附录 A. 仓库目录结构", "h1"))
    story.append(P("""
backend/
  pulse-common/       通用 Result / JWT / Redis Key / 异常
  pulse-proto/        im.proto 协议与生成类
  pulse-api/          Spring Boot REST 业务 + 管理后台接口
  pulse-im-server/    Netty WebSocket + 消息入队/批量落库/推送
frontend/
  mobile/             用户端 H5（Vue3 + Vant + Capacitor）
  admin/              管理后台（Vue3 + Element Plus）
android/              Capacitor Android 工程
deploy/               docker-compose / nginx / postgres SQL / 制品
docker/               API / IM Dockerfile
tools/                压测、ASR、ffmpeg 等辅助工具
docs/                 本文档与生成脚本
""", "code"))
    story.append(P("附录 B. 关键配置说明", "h1"))
    story.append(P(
        "IM 服务配置（application.yml）: 端口 9001、WS 路径 /ws、节点 ID IM_NODE_ID、心跳超时 90s、"
        "JWT 密钥与有效期、Hikari 连接池。生产环境变量通过 Docker Compose 注入（DB_*/REDIS_*/JWT_SECRET 等）。"))
    story.append(P(
        "Schema 迁移: API 启动时由 SchemaMigrator 按版本链执行（pulse_schema_version），"
        "当前版本 v65（消息去重索引）。"))
    return story


# ---------------------------------------------------------------- build
class NumberedCanvas(pdf_canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            w, h = A4
            self.setFont("MSYH", 8)
            self.setFillColor(colors.HexColor("#888888"))
            self.drawCentredString(w / 2.0, 1.0 * cm, "PulseIM 技术架构文档")
            self.drawCentredString(w / 2.0, 0.7 * cm,
                                   "- %d / %d -" % (self._pageNumber, total))
            self.setStrokeColor(LINE)
            self.setLineWidth(0.4)
            self.line(2.0 * cm, 1.35 * cm, w - 2.0 * cm, 1.35 * cm)
            super().showPage()
        super().save()


def header_footer(canvas_doc, doc):
    canvas_doc.saveState()
    w, h = A4
    canvas_doc.setFont("MSYH", 8.5)
    canvas_doc.setFillColor(colors.HexColor("#888888"))
    canvas_doc.drawString(2.0 * cm, h - 1.2 * cm, "PulseIM 技术架构文档 v1.0")
    canvas_doc.drawRightString(w - 2.0 * cm, h - 1.2 * cm, "内部资料")
    canvas_doc.setStrokeColor(LINE)
    canvas_doc.setLineWidth(0.4)
    canvas_doc.line(2.0 * cm, h - 1.35 * cm, w - 2.0 * cm, h - 1.35 * cm)
    canvas_doc.restoreState()


def build():
    doc = Doc(OUT_PDF, pagesize=A4,
              leftMargin=2.0 * cm, rightMargin=2.0 * cm,
              topMargin=1.8 * cm, bottomMargin=1.8 * cm,
              title="PulseIM 技术架构文档", author="PulseIM")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    cover_frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="cover")
    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=header_footer),
        PageTemplate(id="Body", frames=[frame], onPage=header_footer),
    ])
    story = cover_story() + toc_story() + content_story()
    doc.multiBuild(story, canvasmaker=NumberedCanvas)
    print("PDF written:", OUT_PDF)


if __name__ == "__main__":
    build()
