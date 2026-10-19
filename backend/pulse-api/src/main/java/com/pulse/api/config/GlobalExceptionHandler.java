package com.pulse.api.config;

import com.pulse.common.exception.BizException;
import com.pulse.common.result.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.sql.SQLException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BizException.class)
    @ResponseStatus(HttpStatus.OK)
    public R<Void> handleBiz(BizException e) {
        return R.fail(e.getCode(), e.getMessage());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    @ResponseStatus(HttpStatus.OK)
    public R<Void> handleValid(Exception e) {
        String msg = "参数校验失败";
        if (e instanceof MethodArgumentNotValidException manv && manv.getBindingResult().getFieldError() != null) {
            msg = manv.getBindingResult().getFieldError().getDefaultMessage();
        } else if (e instanceof BindException be && be.getBindingResult().getFieldError() != null) {
            msg = be.getBindingResult().getFieldError().getDefaultMessage();
        }
        return R.fail(400, msg);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    @ResponseStatus(HttpStatus.OK)
    public R<Void> handleDataIntegrity(DataIntegrityViolationException e) {
        log.warn("Database constraint violation", e);
        return R.fail(409, constraintMessage(e));
    }

    @ExceptionHandler(DataAccessException.class)
    @ResponseStatus(HttpStatus.OK)
    public R<Void> handleDataAccess(DataAccessException e) {
        log.error("Database access error", e);
        return R.fail(500, "数据库操作失败，请稍后重试");
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.OK)
    public R<Void> handleOther(Exception e) {
        if (isConstraintViolation(e)) {
            log.warn("Database constraint violation", e);
            return R.fail(409, constraintMessage(e));
        }
        log.error("Unhandled error", e);
        return R.fail(500, "服务器内部错误");
    }

    private boolean isConstraintViolation(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof DataIntegrityViolationException) {
                return true;
            }
            if (current instanceof SQLException sql
                    && sql.getSQLState() != null
                    && sql.getSQLState().startsWith("23")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private String constraintMessage(Throwable error) {
        Throwable current = error;
        while (current != null) {
            String message = current.getMessage();
            if (current instanceof SQLException sql
                    && sql.getSQLState() != null
                    && sql.getSQLState().startsWith("23")
                    && message != null) {
                Matcher table = Pattern.compile("on table \\\"([^\\\"]+)\\\"", Pattern.CASE_INSENSITIVE)
                        .matcher(message);
                Matcher constraint = Pattern.compile("constraint \\\"([^\\\"]+)\\\"", Pattern.CASE_INSENSITIVE)
                        .matcher(message);
                if (table.find()) {
                    String suffix = constraint.find() ? "（约束：" + constraint.group(1) + "）" : "";
                    return "操作失败：仍有数据关联到「" + table.group(1) + "」" + suffix + "，请先处理该关联数据。";
                }
            }
            current = current.getCause();
        }
        return "操作失败：数据仍存在关联记录，请先处理相关数据。";
    }
}
